import { VERIFICATION_PAYMENT } from "./contracts.js";
import { getRoleBySlug } from "../../../shared/hiring/roles.js";
import { hashToken } from "../tokens.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function date(value) {
  return new Date(value);
}

function tokenIsActive(token, now, scope) {
  return (
    token.scope === scope &&
    !token.revoked &&
    token.expiresAt > now
  );
}

export function createTestHiringProviders({
  clock = { now: () => new Date("2026-07-10T12:00:00.000Z") }
} = {}) {
  const now = clock.now();
  const role = {
    id: "test-role-1",
    ...getRoleBySlug("senior-ai-product-engineer")
  };
  const campaignToken = "test-private-campaign-token";
  const campaign = {
    id: "test-campaign-1",
    label: "Deterministic private campaign",
    role,
    tokenHash: hashToken(campaignToken),
    activeAt: new Date(now.getTime() - DAY_MS),
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    revokedAt: null
  };
  const state = {
    applications: [],
    tokens: [],
    assessmentSessions: [],
    verifications: [],
    objects: new Map(),
    emails: [],
    payments: [],
    paymentCancellations: [],
    cancellationFailuresRemaining: 0,
    latestReturnToken: null,
    sequence: 0
  };

  function nextId(prefix) {
    state.sequence += 1;
    return `${prefix}-${state.sequence}`;
  }

  function campaignAvailable(at) {
    return !campaign.revokedAt && campaign.activeAt <= at && campaign.expiresAt > at;
  }

  function emailResult(type, input) {
    const message = { id: nextId("email"), type, ...input };
    state.emails.push(message);
    return { providerMessageId: message.id };
  }

  const storage = {
    async createSignedUploadUrl({ objectKey }) {
      return {
        objectKey,
        uploadUrl: `https://uploads.auralis.test/${encodeURIComponent(objectKey)}`,
        uploadToken: "deterministic-upload-token"
      };
    },
    async confirmObject(objectKey) {
      const object = state.objects.get(objectKey);
      return object ? { objectKey, ...object } : null;
    },
    async createSignedDownloadUrl(objectKey, expiresIn) {
      return `https://downloads.auralis.test/${encodeURIComponent(objectKey)}?expires=${expiresIn}`;
    },
    async deleteObject(objectKey) {
      state.objects.delete(objectKey);
      return { deleted: true };
    }
  };

  const email = {
    async enqueueRecruiterApplication(input) {
      return emailResult("recruiter_application", input);
    },
    async enqueueRecruiterAssessment(input) {
      return emailResult("recruiter_assessment", input);
    },
    async enqueueAssessmentReminder(input) {
      return emailResult("assessment_reminder", input);
    },
    async enqueueVerificationCompleteCandidate(input) {
      return emailResult("verification_complete_candidate", input);
    },
    async enqueueVerificationCompleteRecruiter(input) {
      return emailResult("verification_complete_recruiter", input);
    },
    async enqueueVerificationAlert(input) {
      return emailResult("verification_alert", input);
    },
    async enqueueDeletionConfirmation(input) {
      return emailResult("privacy_deletion", input);
    }
  };

  const applicationRepository = {
    async findCampaign({ roleSlug, tokenHash, now: at }) {
      return roleSlug === role.slug &&
        tokenHash === campaign.tokenHash &&
        campaignAvailable(at)
        ? campaign
        : null;
    },
    async findCampaignById({ campaignId, now: at }) {
      return campaignId === campaign.id && campaignAvailable(at) ? campaign : null;
    },
    async findByIdempotencyKey(idempotencyKey) {
      return state.applications.find(
        (application) => application.idempotencyKey === idempotencyKey
      ) ?? null;
    },
    async findRecentApplication({ campaignId, roleId, email: address, since }) {
      return state.applications.find(
        (application) =>
          application.campaign.id === campaignId &&
          application.role.id === roleId &&
          application.email.toLowerCase() === address.trim().toLowerCase() &&
          application.createdAt >= since
      ) ?? null;
    },
    async createApplication(input) {
      const application = {
        id: nextId("application"),
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        fullName: input.payload.fullName,
        email: input.payload.email,
        country: input.payload.country,
        timeZone: input.payload.timeZone,
        availability: input.payload.availability,
        cvObjectKey: input.payload.cvObjectKey,
        campaign: input.campaign,
        role: input.campaign.role,
        lifecycleState: "assessment_invited",
        createdAt: input.now,
        deletionDueAt: new Date(input.now.getTime() + 180 * DAY_MS),
        deletionAttemptCount: 0,
        result: {
          applicationReference: input.reference
        }
      };
      state.applications.push(application);
      state.tokens.push(
        {
          applicationId: application.id,
          hash: input.assessmentTokenHash,
          scope: "assessment",
          expiresAt: input.assessmentExpiresAt,
          revoked: false,
          used: false
        },
        {
          applicationId: application.id,
          hash: input.recruiterTokenHash,
          scope: "recruiter_cv",
          expiresAt: input.recruiterTokenExpiresAt,
          revoked: false,
          used: false
        }
      );
      state.assessmentSessions.push({
        id: nextId("assessment"),
        tokenHash: input.assessmentTokenHash,
        assessmentVersion: 1,
        invitationIssuedAt: input.now,
        invitationExpiresAt: input.assessmentExpiresAt,
        startedAt: null,
        deadlineAt: null,
        submittedAt: null,
        questionSnapshot: null,
        responseVersion: 0,
        responses: new Map(),
        locked: false,
        completionReason: null,
        reminderSentAt: null,
        reminderAttemptCount: 0,
        application
      });
      return application;
    },
    async consumeAccessToken({ tokenHash, scope, now: at }) {
      const token = state.tokens.find(
        (candidate) =>
          candidate.hash === tokenHash &&
          tokenIsActive(candidate, at, scope) &&
          !candidate.used
      );
      if (!token) return null;
      token.used = true;
      return state.applications.find(
        (application) => application.id === token.applicationId
      ) ?? null;
    }
  };

  const assessmentRepository = {
    async findSessionByTokenHash(tokenHash) {
      return state.assessmentSessions.find(
        (session) => session.tokenHash === tokenHash
      ) ?? null;
    },
    async startSession({ sessionId, questionSnapshot, startedAt, deadlineAt }) {
      const session = state.assessmentSessions.find(
        (candidate) => candidate.id === sessionId
      );
      session.questionSnapshot = questionSnapshot;
      session.startedAt = startedAt;
      session.deadlineAt = deadlineAt;
      session.application.lifecycleState = "assessment_started";
      return session;
    },
    async saveAnswer({
      sessionId,
      questionId,
      optionId,
      expectedVersion,
      savedAt
    }) {
      const session = state.assessmentSessions.find(
        (candidate) => candidate.id === sessionId
      );
      if (session.responseVersion !== expectedVersion) {
        return { conflict: true, version: session.responseVersion, savedAt };
      }
      session.responseVersion += 1;
      session.responses.set(questionId, { optionId, savedAt });
      return { conflict: false, version: session.responseVersion, savedAt };
    },
    async completeSession(input) {
      const session = state.assessmentSessions.find(
        (candidate) => candidate.id === input.sessionId
      );
      if (session.submittedAt) return { session, newlyCompleted: false };
      session.submittedAt = input.submittedAt;
      session.locked = true;
      session.completionReason = input.reason;
      session.rawScore = input.result.rawScore;
      session.dimensionScores = input.result.dimensionScores;
      session.application.lifecycleState =
        input.reason === "submitted"
          ? "assessment_submitted"
          : "assessment_expired";
      session.application.deletionDueAt = new Date(
        input.submittedAt.getTime() + 180 * DAY_MS
      );
      if (input.verificationTokenHash) {
        state.tokens.push({
          applicationId: session.application.id,
          hash: input.verificationTokenHash,
          scope: "verification",
          expiresAt: new Date(input.submittedAt.getTime() + 72 * HOUR_MS),
          revoked: false,
          used: false
        });
      }
      state.tokens.push({
        applicationId: session.application.id,
        hash: input.recruiterTokenHash,
        scope: "recruiter_cv",
        expiresAt: input.recruiterTokenExpiresAt,
        revoked: false,
        used: false
      });
      return { session, newlyCompleted: true };
    },
    async claimDueReminders() {
      return [];
    },
    async recordReminderAttempt() {
      return true;
    }
  };

  function verificationById(id) {
    return state.verifications.find((verification) => verification.id === id) ?? null;
  }

  const verificationRepository = {
    async findApplicationByVerificationTokenHash(tokenHash, at) {
      const token = state.tokens.find(
        (candidate) =>
          candidate.hash === tokenHash &&
          tokenIsActive(candidate, at, "verification")
      );
      return token
        ? state.applications.find(
            (application) => application.id === token.applicationId
          ) ?? null
        : null;
    },
    async reserveVerification(input) {
      const existing = state.verifications.find(
        (verification) =>
          verification.application.id === input.application.id ||
          verification.idempotencyKey === input.idempotencyKey
      );
      if (existing) return { verification: existing, newlyCreated: false };
      const verification = {
        id: nextId("verification"),
        application: input.application,
        merchantReference: input.merchantReference,
        providerPaymentId: null,
        amountMinor: input.amountMinor,
        currency: input.currency,
        preAuth: input.preAuth,
        idempotencyKey: input.idempotencyKey,
        approvalUrl: null,
        sessionExpiresAt: null,
        returnTokenHash: input.returnTokenHash,
        returnTokenExpiresAt: input.returnTokenExpiresAt,
        state: "creating",
        providerState: null,
        cancellationState: "not_requested",
        cancellationAttemptCount: 0,
        nextRetryAt: null,
        errorCategory: null
      };
      state.verifications.push(verification);
      state.tokens.push({
        applicationId: input.application.id,
        hash: input.returnTokenHash,
        scope: "verification_return",
        expiresAt: input.returnTokenExpiresAt,
        revoked: false,
        used: false
      });
      input.application.lifecycleState = "verification_pending";
      return { verification, newlyCreated: true };
    },
    async activateVerification(input) {
      const verification = verificationById(input.verificationId);
      verification.providerPaymentId = input.providerPaymentId;
      verification.approvalUrl = input.approvalUrl;
      verification.sessionExpiresAt = input.sessionExpiresAt;
      verification.state = "pending";
      return verification;
    },
    async findByProviderPaymentId(providerPaymentId) {
      return state.verifications.find(
        (verification) => verification.providerPaymentId === providerPaymentId
      ) ?? null;
    },
    async findVerificationById(verificationId) {
      return verificationById(verificationId);
    },
    async beginCancellation({ verificationId, providerState }) {
      const verification = verificationById(verificationId);
      if (!verification || verification.state !== "pending") {
        return { acquired: false, verification };
      }
      verification.state = "processing";
      verification.providerState = providerState;
      verification.cancellationState = "processing";
      verification.application.lifecycleState = "verification_processing";
      return { acquired: true, verification };
    },
    async completeCancellation({ verificationId, completedAt }) {
      const verification = verificationById(verificationId);
      if (!verification || verification.state === "completed") {
        return { newlyCompleted: false, verification };
      }
      verification.state = "completed";
      verification.providerState = "cancelled";
      verification.cancellationState = "cancelled";
      verification.completedAt = completedAt;
      verification.nextRetryAt = null;
      verification.application.lifecycleState = "completed";
      return { newlyCompleted: true, verification };
    },
    async failVerification({
      verificationId,
      providerState,
      errorCategory,
      failedAt
    }) {
      const verification = verificationById(verificationId);
      if (!verification || verification.state === "failed") {
        return { newlyFailed: false, verification };
      }
      verification.state = "failed";
      verification.providerState = providerState;
      verification.errorCategory = errorCategory;
      verification.failedAt = failedAt;
      verification.application.lifecycleState = "verification_failed";
      return { newlyFailed: true, verification };
    },
    async scheduleCancellationRetry(input) {
      const verification = verificationById(input.verificationId);
      verification.state = "processing";
      verification.cancellationState = "retry_scheduled";
      verification.cancellationAttemptCount = input.attemptNumber;
      verification.nextRetryAt = input.nextRetryAt;
      verification.errorCategory = input.errorCategory;
      return verification;
    },
    async findByAccessTokenHash(tokenHash, at) {
      const token = state.tokens.find(
        (candidate) =>
          candidate.hash === tokenHash &&
          ["verification", "verification_return"].includes(candidate.scope) &&
          tokenIsActive(candidate, at, candidate.scope)
      );
      if (!token) return null;
      const application = state.applications.find(
        (candidate) => candidate.id === token.applicationId
      );
      const verification = state.verifications.find(
        (candidate) => candidate.application.id === token.applicationId
      ) ?? null;
      return { application, verification };
    },
    async claimDueCancellations({ now: at, limit }) {
      return state.verifications
        .filter(
          (verification) =>
            verification.state === "processing" &&
            verification.nextRetryAt &&
            verification.nextRetryAt <= at
        )
        .slice(0, limit)
        .map((verification) => {
          verification.cancellationAttemptCount += 1;
          return verification;
        });
    }
  };

  const payment = {
    async createHostedSession({ merchantPaymentId }) {
      const providerPaymentId = nextId("test-payment");
      state.payments.push({
        providerPaymentId,
        merchantPaymentId,
        amountMinor: VERIFICATION_PAYMENT.amountMinor,
        currency: VERIFICATION_PAYMENT.currency,
        preAuth: VERIFICATION_PAYMENT.preAuth,
        state: "created"
      });
      return {
        providerPaymentId,
        approvalUrl: `https://payments.auralis.test/checkout/${providerPaymentId}`,
        expiresAt: new Date(clock.now().getTime() + 15 * 60 * 1000)
      };
    },
    async getPayment(providerPaymentId) {
      const paymentRecord = state.payments.find(
        (candidate) => candidate.providerPaymentId === providerPaymentId
      );
      if (!paymentRecord) throw new Error("Test payment not found.");
      return { ...paymentRecord };
    },
    async cancelPayment(providerPaymentId) {
      const paymentRecord = state.payments.find(
        (candidate) => candidate.providerPaymentId === providerPaymentId
      );
      if (!paymentRecord) throw new Error("Test payment not found.");
      if (state.cancellationFailuresRemaining > 0) {
        state.cancellationFailuresRemaining -= 1;
        throw Object.assign(new Error("Deterministic cancellation delay."), {
          retriable: true
        });
      }
      if (paymentRecord.state !== "cancelled") {
        paymentRecord.state = "cancelled";
        state.paymentCancellations.push(providerPaymentId);
      }
      return { state: "cancelled" };
    }
  };

  const privacyRepository = {
    async claimExpiredApplications({ now: at, limit }) {
      return state.applications
        .filter((application) => application.deletionDueAt <= at)
        .slice(0, limit)
        .map((application) => {
          application.deletionAttemptCount += 1;
          return application;
        });
    },
    async createDeletionRequest() {
      return null;
    },
    async claimDeletionByTokenHash() {
      return null;
    },
    async finalizeApplicationDeletion({ applicationId }) {
      const index = state.applications.findIndex(
        (application) => application.id === applicationId
      );
      if (index >= 0) state.applications.splice(index, 1);
      return true;
    },
    async recordDeletionFailure() {
      return true;
    }
  };

  const controls = {
    uploadObject(objectKey, object) {
      state.objects.set(objectKey, { ...object });
    },
    authorizePayment(providerPaymentId) {
      const paymentRecord = state.payments.find(
        (candidate) => candidate.providerPaymentId === providerPaymentId
      );
      if (!paymentRecord) throw new Error("Test payment not found.");
      paymentRecord.state = "authorized";
    },
    latestProviderPaymentId() {
      return state.payments.at(-1)?.providerPaymentId ?? null;
    },
    failNextCancellations(count) {
      state.cancellationFailuresRemaining = Math.max(0, count);
    },
    nextToken(prefix = "test-token") {
      return `${prefix}-${nextId("opaque")}-with-enough-entropy`;
    }
  };

  return {
    state,
    campaign: { ...campaign, token: campaignToken },
    storage,
    email,
    payment,
    controls,
    repositories: {
      application: applicationRepository,
      assessment: assessmentRepository,
      verification: verificationRepository,
      privacy: privacyRepository
    }
  };
}
