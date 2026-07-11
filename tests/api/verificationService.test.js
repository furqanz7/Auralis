import { describe, expect, test, vi } from "vitest";
import {
  VerificationDomainError,
  createVerificationService,
  createVerificationStatusService
} from "../../api/_lib/verificationService.js";
import { hashToken } from "../../api/_lib/tokens.js";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const VERIFICATION_TOKEN = "verification-token-with-enough-entropy";
const RETURN_TOKEN = "return-token-with-enough-entropy";

function createFixture({
  lifecycleState = "assessment_submitted",
  paymentReport = null
} = {}) {
  let now = new Date(NOW);
  const application = {
    id: "application-1",
    reference: "AUR-1",
    fullName: "Nino Beridze",
    email: "nino@example.com",
    lifecycleState,
    assessmentRawScore: 14,
    recruiterPriority: null,
    role: {
      slug: "senior-ai-product-engineer",
      title: "Senior AI Product Engineer"
    }
  };
  let verification = null;
  const state = {
    alerts: [],
    candidateEmails: [],
    recruiterEmails: [],
    paymentReport
  };

  const repository = {
    findApplicationByVerificationTokenHash: vi.fn(async (tokenHash) =>
      tokenHash === hashToken(VERIFICATION_TOKEN) ? application : null
    ),
    reserveVerification: vi.fn(async (input) => {
      if (verification) return { verification, newlyCreated: false };
      verification = {
        id: "verification-1",
        application,
        merchantReference: input.merchantReference,
        idempotencyKey: input.idempotencyKey,
        returnTokenHash: input.returnTokenHash,
        returnTokenExpiresAt: input.returnTokenExpiresAt,
        amountMinor: input.amountMinor,
        currency: input.currency,
        preAuth: input.preAuth,
        state: "creating",
        providerPaymentId: null,
        approvalUrl: null,
        cancellationAttemptCount: 0,
        nextRetryAt: null
      };
      return { verification, newlyCreated: true };
    }),
    activateVerification: vi.fn(async (input) => {
      Object.assign(verification, {
        providerPaymentId: input.providerPaymentId,
        approvalUrl: input.approvalUrl,
        sessionExpiresAt: input.sessionExpiresAt,
        state: "pending"
      });
      application.lifecycleState = "verification_pending";
      return verification;
    }),
    findByProviderPaymentId: vi.fn(async (providerPaymentId) =>
      verification?.providerPaymentId === providerPaymentId ? verification : null
    ),
    findVerificationById: vi.fn(async (verificationId) =>
      verification?.id === verificationId ? verification : null
    ),
    beginCancellation: vi.fn(async ({ verificationId, providerState }) => {
      if (
        verification?.id !== verificationId ||
        ["processing", "completed", "failed"].includes(verification.state)
      ) {
        return { acquired: false, verification };
      }
      verification.state = "processing";
      verification.providerState = providerState;
      application.lifecycleState = "verification_processing";
      return { acquired: true, verification };
    }),
    completeCancellation: vi.fn(async ({ verificationId, completedAt }) => {
      if (verification?.id !== verificationId || verification.state === "completed") {
        return { newlyCompleted: false, verification };
      }
      verification.state = "completed";
      verification.completedAt = completedAt;
      verification.nextRetryAt = null;
      application.lifecycleState = "completed";
      return { newlyCompleted: true, verification };
    }),
    failVerification: vi.fn(async ({ verificationId, errorCategory, providerState }) => {
      if (verification?.id !== verificationId || verification.state === "failed") {
        return { newlyFailed: false, verification };
      }
      verification.state = "failed";
      verification.errorCategory = errorCategory;
      verification.providerState = providerState;
      application.lifecycleState = "verification_failed";
      return { newlyFailed: true, verification };
    }),
    scheduleCancellationRetry: vi.fn(async (input) => {
      verification.state = "processing";
      verification.cancellationAttemptCount = input.attemptNumber;
      verification.nextRetryAt = input.nextRetryAt;
      verification.errorCategory = input.errorCategory;
      application.lifecycleState = "verification_processing";
      return verification;
    }),
    findByAccessTokenHash: vi.fn(async (tokenHash) => {
      if (
        tokenHash === hashToken(VERIFICATION_TOKEN) ||
        tokenHash === verification?.returnTokenHash
      ) {
        return { application, verification, paymentReport: state.paymentReport };
      }
      return null;
    })
  };

  const payment = {
    createHostedSession: vi.fn(async () => ({
      providerPaymentId: "tpay-payment-1",
      approvalUrl: "https://tpay.tbcbank.ge/checkout/tpay-payment-1",
      expiresAt: new Date("2026-07-10T12:12:00.000Z")
    })),
    getPayment: vi.fn(async () => ({
      providerPaymentId: "tpay-payment-1",
      state: "authorized",
      amountMinor: 299,
      currency: "EUR",
      preAuth: true,
      merchantPaymentId: "VERIFY-AUR-1"
    })),
    cancelPayment: vi.fn(async () => ({
      providerPaymentId: "tpay-payment-1",
      state: "cancelled"
    }))
  };
  const email = {
    enqueueVerificationCompleteCandidate: vi.fn(async (input) => {
      state.candidateEmails.push(input);
    }),
    enqueueVerificationCompleteRecruiter: vi.fn(async (input) => {
      state.recruiterEmails.push(input);
    }),
    enqueueVerificationAlert: vi.fn(async (input) => {
      state.alerts.push(input);
    })
  };
  const service = createVerificationService({
    repository,
    payment,
    email,
    clock: { now: () => new Date(now) },
    returnTokenFactory: () => RETURN_TOKEN,
    merchantReferenceFactory: (candidate) => `VERIFY-${candidate.reference}`
  });

  return {
    application,
    email,
    payment,
    repository,
    service,
    state,
    get verification() {
      return verification;
    },
    setNow(value) {
      now = new Date(value);
    }
  };
}

async function createSession(fixture, idempotencyKey = "verification-session-1") {
  return fixture.service.createSession({
    verificationToken: VERIFICATION_TOKEN,
    returnBaseUrl: "https://auralis.studio",
    idempotencyKey
  });
}

describe("verification service", () => {
  test("only allows an assessment-submitted application to begin", async () => {
    const fixture = createFixture({ lifecycleState: "assessment_started" });

    await expect(createSession(fixture)).rejects.toEqual(
      expect.objectContaining({
        name: "VerificationDomainError",
        code: "VERIFICATION_UNAVAILABLE",
        status: 409
      })
    );
    expect(VerificationDomainError).toBeTypeOf("function");
    expect(fixture.payment.createHostedSession).not.toHaveBeenCalled();
  });

  test("creates one fixed hosted preauthorization and persists its safe handoff", async () => {
    const fixture = createFixture();

    await expect(createSession(fixture)).resolves.toEqual({
      approvalUrl: "https://tpay.tbcbank.ge/checkout/tpay-payment-1"
    });
    expect(fixture.payment.createHostedSession).toHaveBeenCalledWith({
      merchantPaymentId: "VERIFY-AUR-1",
      returnUrl:
        "https://auralis.studio/application/AUR-1/complete/return-token-with-enough-entropy",
      callbackUrl: "https://auralis.studio/api/payments/tbc/callback"
    });
    expect(fixture.repository.reserveVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 299,
        currency: "EUR",
        preAuth: true,
        returnTokenHash: hashToken(RETURN_TOKEN)
      })
    );
    expect(fixture.verification.state).toBe("pending");
  });

  test("returns the same provider session for repeated idempotent creation", async () => {
    const fixture = createFixture();

    const first = await createSession(fixture);
    const second = await createSession(fixture);

    expect(second).toEqual(first);
    expect(fixture.payment.createHostedSession).toHaveBeenCalledTimes(1);
  });

  test("authoritatively verifies the hold and cancels it before completing", async () => {
    const fixture = createFixture();
    await createSession(fixture);

    await expect(
      fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" })
    ).resolves.toEqual({ acknowledged: true });

    expect(fixture.payment.getPayment).toHaveBeenCalledWith("tpay-payment-1");
    expect(fixture.payment.cancelPayment).toHaveBeenCalledWith("tpay-payment-1");
    expect(fixture.application.lifecycleState).toBe("completed");
    expect(fixture.state.candidateEmails).toHaveLength(0);
    expect(fixture.state.recruiterEmails).toHaveLength(1);
  });

  test("fails closed and alerts operations when authoritative details mismatch", async () => {
    const fixture = createFixture();
    await createSession(fixture);
    fixture.payment.getPayment.mockResolvedValueOnce({
      providerPaymentId: "tpay-payment-1",
      state: "authorized",
      amountMinor: 399,
      currency: "EUR",
      preAuth: true,
      merchantPaymentId: "VERIFY-AUR-1"
    });

    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });

    expect(fixture.application.lifecycleState).toBe("verification_failed");
    expect(fixture.payment.cancelPayment).not.toHaveBeenCalled();
    expect(fixture.state.alerts).toHaveLength(1);
    expect(fixture.state.candidateEmails).toHaveLength(0);
  });

  test("acknowledges duplicate callbacks without duplicate cancellation or email", async () => {
    const fixture = createFixture();
    await createSession(fixture);

    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });
    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });

    expect(fixture.payment.cancelPayment).toHaveBeenCalledTimes(1);
    expect(fixture.email.enqueueVerificationCompleteCandidate).not.toHaveBeenCalled();
    expect(fixture.email.enqueueVerificationCompleteRecruiter).toHaveBeenCalledTimes(1);
  });

  test("persists a retry when cancellation is temporarily unavailable", async () => {
    const fixture = createFixture();
    await createSession(fixture);
    fixture.payment.cancelPayment.mockRejectedValueOnce(
      Object.assign(new Error("temporary"), { retriable: true })
    );

    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });

    expect(fixture.application.lifecycleState).toBe("verification_processing");
    expect(fixture.repository.scheduleCancellationRetry).toHaveBeenCalledWith({
      verificationId: "verification-1",
      attemptNumber: 1,
      nextRetryAt: new Date("2026-07-10T12:01:00.000Z"),
      errorCategory: "PROVIDER_TEMPORARY",
      attemptedAt: NOW
    });
    expect(fixture.state.candidateEmails).toHaveLength(0);
  });

  test("retries cancellation idempotently and completes after provider recovery", async () => {
    const fixture = createFixture();
    await createSession(fixture);
    fixture.payment.cancelPayment.mockRejectedValueOnce(
      Object.assign(new Error("temporary"), { retriable: true })
    );
    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });
    fixture.setNow("2026-07-10T12:01:00.000Z");

    await fixture.service.retryCancellation("verification-1");
    await fixture.service.retryCancellation("verification-1");

    expect(fixture.application.lifecycleState).toBe("completed");
    expect(fixture.payment.cancelPayment).toHaveBeenCalledTimes(2);
    expect(fixture.state.candidateEmails).toHaveLength(0);
  });

  test("keeps an abandoned payment pending and the application reviewable", async () => {
    const fixture = createFixture();
    await createSession(fixture);

    await expect(
      fixture.service.getStatus({ verificationToken: VERIFICATION_TOKEN })
    ).resolves.toMatchObject({
      state: "pending",
      applicationReference: "AUR-1",
      candidateEmail: "nino@example.com"
    });
    expect(fixture.application.lifecycleState).toBe("verification_pending");
  });

  test("loads a valid verification with a manual Wise payment handoff", async () => {
    const fixture = createFixture();
    const statusService = createVerificationStatusService({
      repository: fixture.repository,
      clock: { now: () => new Date(NOW) },
      checkoutAvailable: true,
      payment: {
        provider: "wise",
        mode: "manual",
        url: "https://wise.com/pay/r/nAx15LFiReIdtjc"
      }
    });

    await expect(
      statusService.getStatus({ verificationToken: VERIFICATION_TOKEN })
    ).resolves.toMatchObject({
      state: "pending",
      applicationReference: "AUR-1",
      checkoutAvailable: true,
      payment: {
        provider: "wise",
        mode: "manual",
        url: "https://wise.com/pay/r/nAx15LFiReIdtjc"
      },
      paymentReport: {
        state: "not_reported",
        reportedAt: null
      }
    });
    expect(fixture.payment.createHostedSession).not.toHaveBeenCalled();
  });

  test("exposes a pending payment report without private report fields", async () => {
    const fixture = createFixture({
      paymentReport: {
        id: "wise-report-1",
        applicationId: "application-1",
        payerName: "Nino Beridze",
        reportedAt: new Date("2026-07-11T10:00:00.000Z"),
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "EMAIL_DELIVERY_FAILED"
      }
    });
    const statusService = createVerificationStatusService({
      repository: fixture.repository,
      clock: { now: () => new Date(NOW) }
    });

    const status = await statusService.getStatus({
      verificationToken: VERIFICATION_TOKEN
    });

    expect(status.paymentReport).toEqual({
      state: "notification_pending",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(JSON.stringify(status)).not.toMatch(
      /payerName|payer_name|Nino Beridze|wise-report-1|notificationAttempt/i
    );
  });

  test("exposes a durable reported state after recruiter notification", async () => {
    const fixture = createFixture({
      paymentReport: {
        id: "wise-report-1",
        payerName: "Nino Beridze",
        reportedAt: new Date("2026-07-11T10:00:00.000Z"),
        notificationSentAt: new Date("2026-07-11T10:01:00.000Z")
      }
    });
    const statusService = createVerificationStatusService({
      repository: fixture.repository,
      clock: { now: () => new Date(NOW) }
    });

    const status = await statusService.getStatus({
      verificationToken: VERIFICATION_TOKEN
    });

    expect(status.paymentReport).toEqual({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(JSON.stringify(status)).not.toMatch(
      /payerName|payer_name|Nino Beridze|wise-report-1/i
    );
  });

  test("never changes assessment results or recruiter priority", async () => {
    const fixture = createFixture();
    await createSession(fixture);
    await fixture.service.handleCallback({ providerPaymentId: "tpay-payment-1" });

    expect(fixture.application.assessmentRawScore).toBe(14);
    expect(fixture.application.recruiterPriority).toBeNull();
    expect(
      await fixture.service.getStatus({ verificationToken: VERIFICATION_TOKEN })
    ).not.toHaveProperty("assessmentRawScore");
  });
});
