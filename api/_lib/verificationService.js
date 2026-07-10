import { VERIFICATION_PAYMENT } from "./adapters/contracts.js";
import { hashToken } from "./tokens.js";

const MINUTE_MS = 60 * 1000;
const RETRY_MINUTES = [1, 5, 15, 60, 240];
const SESSION_ALLOWED_STATES = new Set([
  "assessment_submitted",
  "verification_pending",
  "verification_processing"
]);

export class VerificationDomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "VerificationDomainError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new VerificationDomainError(code, status);
}

function secureBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    fail("VERIFICATION_RETURN_URL_INVALID", 422);
  }
}

function secureApprovalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    fail("VERIFICATION_PROVIDER_INVALID", 502);
  }
}

function publicState(verification) {
  if (!verification || ["creating", "pending"].includes(verification.state)) {
    return "pending";
  }
  if (verification.state === "processing") return "processing";
  if (verification.state === "completed") return "completed";
  return "failed";
}

function providerMatches(verification, provider) {
  return (
    provider.providerPaymentId === verification.providerPaymentId &&
    provider.amountMinor === VERIFICATION_PAYMENT.amountMinor &&
    provider.currency === VERIFICATION_PAYMENT.currency &&
    provider.preAuth === VERIFICATION_PAYMENT.preAuth &&
    provider.merchantPaymentId === verification.merchantReference
  );
}

export function createVerificationStatusService({
  repository,
  clock = { now: () => new Date() },
  checkoutAvailable = true,
  payment = null
}) {
  return {
    async getStatus({ verificationToken }) {
      let tokenHash;
      try {
        tokenHash = hashToken(verificationToken);
      } catch {
        fail("VERIFICATION_INVALID", 404);
      }
      const record = await repository.findByAccessTokenHash(
        tokenHash,
        clock.now()
      );
      if (!record) fail("VERIFICATION_INVALID", 404);
      const { application, verification } = record;
      const state = publicState(verification);
      return {
        state,
        checkoutAvailable,
        payment: payment ? { ...payment } : null,
        applicationReference: application.reference,
        candidateEmail: application.email,
        role: { title: application.role.title },
        verification: {
          amountMinor: VERIFICATION_PAYMENT.amountMinor,
          currency: VERIFICATION_PAYMENT.currency,
          authorization: state === "pending" ? "pending" : "confirmed",
          release:
            state === "completed"
              ? "confirmed"
              : state === "failed"
                ? "attention_required"
                : "processing"
        }
      };
    }
  };
}

export function createVerificationService({
  repository,
  payment,
  email,
  clock = { now: () => new Date() },
  returnTokenFactory,
  merchantReferenceFactory = (application) => `VERIFY-${application.reference}`
}) {
  if (typeof returnTokenFactory !== "function") {
    throw new TypeError("Verification service requires a return token factory.");
  }
  const statusService = createVerificationStatusService({ repository, clock });

  async function dispatchCompletion(verification) {
    await Promise.allSettled([
      email.enqueueVerificationCompleteRecruiter({
        application: verification.application,
        verification
      })
    ]);
  }

  async function dispatchAlert(verification, errorCategory) {
    await Promise.allSettled([
      email.enqueueVerificationAlert({
        application: verification.application,
        verification,
        errorCategory
      })
    ]);
  }

  async function markFailed(verification, providerState, errorCategory, alert) {
    const result = await repository.failVerification({
      verificationId: verification.id,
      providerState,
      errorCategory,
      failedAt: clock.now()
    });
    if (alert && result.newlyFailed) {
      await dispatchAlert(result.verification, errorCategory);
    }
    return result;
  }

  function retryAt(now, attemptNumber) {
    const minutes = RETRY_MINUTES[Math.min(attemptNumber - 1, RETRY_MINUTES.length - 1)];
    return new Date(now.getTime() + minutes * MINUTE_MS);
  }

  async function scheduleRetry(verification, error, claimedAttemptNumber = null) {
    const attemptedAt = clock.now();
    const attemptNumber =
      claimedAttemptNumber ?? verification.cancellationAttemptCount + 1;
    if (!error?.retriable || attemptNumber >= RETRY_MINUTES.length) {
      await markFailed(
        verification,
        verification.providerState ?? "authorized",
        "CANCELLATION_FAILED",
        true
      );
      return;
    }
    await repository.scheduleCancellationRetry({
      verificationId: verification.id,
      attemptNumber,
      nextRetryAt: retryAt(attemptedAt, attemptNumber),
      errorCategory: "PROVIDER_TEMPORARY",
      attemptedAt
    });
  }

  async function finishCancellation(verification) {
    const completion = await repository.completeCancellation({
      verificationId: verification.id,
      completedAt: clock.now()
    });
    if (completion.newlyCompleted) await dispatchCompletion(completion.verification);
    return completion;
  }

  async function cancelAndComplete(verification, claimedAttemptNumber = null) {
    try {
      const cancellation = await payment.cancelPayment(
        verification.providerPaymentId
      );
      if (cancellation?.state !== "cancelled") {
        throw Object.assign(new Error("Cancellation was not confirmed."), {
          retriable: true
        });
      }
      await finishCancellation(verification);
    } catch (error) {
      await scheduleRetry(verification, error, claimedAttemptNumber);
    }
  }

  return {
    async createSession({ verificationToken, returnBaseUrl, idempotencyKey }) {
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
        fail("IDEMPOTENCY_KEY_REQUIRED", 400);
      }
      let tokenHash;
      try {
        tokenHash = hashToken(verificationToken);
      } catch {
        fail("VERIFICATION_INVALID", 404);
      }
      const now = clock.now();
      const application = await repository.findApplicationByVerificationTokenHash(
        tokenHash,
        now
      );
      if (!application) fail("VERIFICATION_INVALID", 404);
      if (!SESSION_ALLOWED_STATES.has(application.lifecycleState)) {
        fail("VERIFICATION_UNAVAILABLE", 409);
      }

      const merchantReference = merchantReferenceFactory(application);
      if (
        typeof merchantReference !== "string" ||
        merchantReference.length < 1 ||
        merchantReference.length > 25 ||
        !/^[\x20-\x7E]+$/.test(merchantReference)
      ) {
        fail("VERIFICATION_REFERENCE_INVALID", 500);
      }
      const returnToken = returnTokenFactory({
        applicationId: application.id,
        idempotencyKey
      });
      const base = secureBaseUrl(returnBaseUrl);
      const returnUrl = new URL(
        `application/${encodeURIComponent(application.reference)}/complete/${encodeURIComponent(returnToken)}`,
        base
      ).toString();
      const callbackUrl = new URL("api/payments/tbc/callback", base).toString();
      const reservation = await repository.reserveVerification({
        application,
        merchantReference,
        idempotencyKey,
        returnTokenHash: hashToken(returnToken),
        returnTokenExpiresAt: new Date(now.getTime() + 72 * 60 * MINUTE_MS),
        amountMinor: VERIFICATION_PAYMENT.amountMinor,
        currency: VERIFICATION_PAYMENT.currency,
        preAuth: VERIFICATION_PAYMENT.preAuth,
        createdAt: now
      });

      if (!reservation.newlyCreated) {
        if (reservation.verification.approvalUrl) {
          return { approvalUrl: reservation.verification.approvalUrl };
        }
        fail("VERIFICATION_PROCESSING", 409);
      }

      const hosted = await payment.createHostedSession({
        merchantPaymentId: merchantReference,
        returnUrl,
        callbackUrl
      });
      const approvalUrl = secureApprovalUrl(hosted.approvalUrl);
      await repository.activateVerification({
        verificationId: reservation.verification.id,
        providerPaymentId: hosted.providerPaymentId,
        approvalUrl,
        sessionExpiresAt: hosted.expiresAt,
        activatedAt: clock.now()
      });
      return { approvalUrl };
    },

    async handleCallback({ providerPaymentId }) {
      if (typeof providerPaymentId !== "string" || !providerPaymentId) {
        fail("PAYMENT_CALLBACK_INVALID", 422);
      }
      const verification = await repository.findByProviderPaymentId(
        providerPaymentId
      );
      if (!verification || ["completed", "failed"].includes(verification.state)) {
        return { acknowledged: true };
      }

      const provider = await payment.getPayment(providerPaymentId);
      if (!providerMatches(verification, provider)) {
        await markFailed(verification, provider.state, "PROVIDER_MISMATCH", true);
        return { acknowledged: true };
      }
      if (["created", "processing"].includes(provider.state)) {
        return { acknowledged: true };
      }
      if (["failed", "expired"].includes(provider.state)) {
        await markFailed(verification, provider.state, "PROVIDER_TERMINAL", false);
        return { acknowledged: true };
      }
      if (provider.state === "cancelled") {
        await finishCancellation(verification);
        return { acknowledged: true };
      }
      if (provider.state !== "authorized") {
        await markFailed(verification, provider.state, "PROVIDER_STATE_INVALID", true);
        return { acknowledged: true };
      }

      const cancellation = await repository.beginCancellation({
        verificationId: verification.id,
        providerState: provider.state,
        callbackAt: clock.now()
      });
      if (cancellation.acquired) {
        await cancelAndComplete(cancellation.verification);
      }
      return { acknowledged: true };
    },

    async retryCancellation(verificationId) {
      const verification = await repository.findVerificationById(verificationId);
      if (!verification || verification.state !== "processing") {
        return { processed: false };
      }
      await cancelAndComplete(verification);
      return { processed: true };
    },

    async retryDueCancellations({ limit = 20 } = {}) {
      if (typeof repository.claimDueCancellations !== "function") {
        throw new TypeError("Verification cancellation retries are not configured.");
      }
      const claimed = await repository.claimDueCancellations({
        now: clock.now(),
        limit: Math.max(1, Math.min(20, Number.isInteger(limit) ? limit : 20))
      });
      const summary = { claimed: claimed.length, completed: 0, failed: 0 };
      for (const verification of claimed) {
        const before = verification.state;
        await cancelAndComplete(
          verification,
          verification.cancellationAttemptCount
        );
        const current = await repository.findVerificationById(verification.id);
        if (current?.state === "completed") summary.completed += 1;
        else if (current?.state === "failed" || before === "failed") {
          summary.failed += 1;
        }
      }
      return summary;
    },

    getStatus: statusService.getStatus
  };
}
