import { hashToken } from "./tokens.js";

export class WisePaymentReportDomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "WisePaymentReportDomainError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new WisePaymentReportDomainError(code, status);
}

function normalizePayerName(value) {
  if (typeof value !== "string") fail("PAYMENT_REPORT_NAME_INVALID", 422);

  const trimmed = value.trim();
  if (
    /[\p{Cc}\p{Cs}]/u.test(trimmed) ||
    [...trimmed].length < 2 ||
    [...trimmed].length > 120
  ) {
    fail("PAYMENT_REPORT_NAME_INVALID", 422);
  }
  return trimmed;
}

function reportedAtIso(paymentReport) {
  return new Date(paymentReport.reportedAt).toISOString();
}

function publicResult(paymentReport) {
  return {
    state: paymentReport.notificationSentAt
      ? "reported"
      : "notification_pending",
    reportedAt: reportedAtIso(paymentReport)
  };
}

export function createWisePaymentReportService({
  repository,
  email,
  clock = { now: () => new Date() }
}) {
  async function deliverClaim({ application, paymentReport, notificationClaimed }) {
    if (!notificationClaimed) return publicResult(paymentReport);

    const attemptNumber = paymentReport.notificationAttemptCount;
    try {
      await email.enqueueWisePaymentReport({ application, paymentReport });
    } catch {
      const failedAt = clock.now();
      const failedReport = await repository.markNotificationFailed({
        reportId: paymentReport.id,
        attemptNumber,
        errorCategory: "EMAIL_DELIVERY_FAILED",
        failedAt
      });
      return publicResult(failedReport ?? paymentReport);
    }

    const sentAt = clock.now();
    const sentReport = await repository.markNotificationSent({
      reportId: paymentReport.id,
      attemptNumber,
      sentAt
    });
    return publicResult(sentReport ?? { ...paymentReport, notificationSentAt: sentAt });
  }

  return {
    async reportPayment({ verificationToken, payerName }) {
      let tokenHash;
      try {
        tokenHash = hashToken(verificationToken);
      } catch {
        fail("PAYMENT_REPORT_INVALID", 404);
      }

      const now = clock.now();
      const record = await repository.findByAccessTokenHash(tokenHash, now);
      if (!record?.application) fail("PAYMENT_REPORT_INVALID", 404);

      const { application, paymentReport } = record;
      if (application.deletedAt || application.deleted_at) {
        fail("PAYMENT_REPORT_INVALID", 404);
      }
      if (application.lifecycleState !== "assessment_submitted") {
        fail("PAYMENT_REPORT_UNAVAILABLE", 409);
      }

      if (paymentReport?.notificationSentAt) {
        return publicResult(paymentReport);
      }

      if (!paymentReport) {
        if (payerName === undefined || payerName === null) {
          fail("PAYMENT_REPORT_NAME_REQUIRED", 422);
        }
        const created = await repository.createAndClaim({
          tokenHash,
          payerName: normalizePayerName(payerName),
          reportedAt: now
        });
        return deliverClaim(created);
      }

      const claimed = await repository.claimNotification({
        reportId: paymentReport.id,
        claimedAt: clock.now()
      });
      return deliverClaim(claimed);
    }
  };
}
