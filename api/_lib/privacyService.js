import { hashToken } from "./tokens.js";

const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_BASE_MS = 60 * 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;

export class PrivacyDomainError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "PrivacyDomainError";
    this.code = code;
    this.status = status;
  }
}

function deletionRetryAt(now, attemptNumber) {
  const exponent = Math.max(0, Math.min(Number(attemptNumber) - 1, 8));
  const delay = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  return new Date(now.getTime() + delay);
}

function deletionAttempt(application) {
  const attempt = Number(application?.deletionAttemptCount);
  return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function createHiringPrivacyService({
  repository,
  storage,
  email,
  clock = { now: () => new Date() },
  tokenFactory
}) {
  async function recordDeletionFailure(
    application,
    attemptedAt,
    errorCategory
  ) {
    const attemptNumber = deletionAttempt(application);
    await repository.recordDeletionFailure({
      applicationId: application.id,
      attemptNumber,
      errorCategory,
      attemptedAt,
      nextAttemptAt: deletionRetryAt(attemptedAt, attemptNumber)
    });
  }

  async function deleteApplication(application, reason, attemptedAt) {
    try {
      await storage.deleteObject(application.cvObjectKey);
    } catch {
      await recordDeletionFailure(
        application,
        attemptedAt,
        "STORAGE_DELETE_FAILED"
      );
      return false;
    }

    try {
      await repository.finalizeApplicationDeletion({
        applicationId: application.id,
        reason,
        deletedAt: attemptedAt
      });
    } catch {
      await recordDeletionFailure(
        application,
        attemptedAt,
        "DATABASE_DELETE_FAILED"
      );
      return false;
    }
    return true;
  }

  return {
    async purgeExpiredApplications({ limit = 25 } = {}) {
      const now = clock.now();
      const applications = await repository.claimExpiredApplications({ now, limit });
      let deleted = 0;
      let failed = 0;

      for (const application of applications) {
        if (await deleteApplication(application, "retention", now)) deleted += 1;
        else failed += 1;
      }

      return { claimed: applications.length, deleted, failed };
    },

    async requestDeletion() {
      return { accepted: true };
    },

    async confirmDeletion({ deletionToken }) {
      const now = clock.now();
      const application = await repository.claimDeletionByTokenHash(
        hashToken(deletionToken),
        now
      );
      if (!application) {
        throw new PrivacyDomainError("DELETION_LINK_INVALID", 404);
      }

      const deleted = await deleteApplication(application, "candidate_request", now);
      if (!deleted) {
        throw new PrivacyDomainError("DELETION_RETRY_PENDING", 503);
      }
      return { deleted: true };
    }
  };
}
