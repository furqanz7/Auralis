import { describe, expect, test, vi } from "vitest";
import {
  WisePaymentReportDomainError,
  createWisePaymentReportService
} from "../../api/_lib/wisePaymentReportService.js";
import { hashToken } from "../../api/_lib/tokens.js";

const NOW = new Date("2026-07-11T10:00:00.000Z");
const VERIFICATION_TOKEN = "verification-token-with-enough-entropy";

function createFixture({
  lifecycleState = "assessment_submitted",
  lookup = "valid",
  paymentReport = null,
  emailFailure = false
} = {}) {
  const application = {
    id: "application-1",
    reference: "AUR-1",
    fullName: "Nino Beridze",
    email: "nino@example.com",
    lifecycleState,
    deletedAt: null,
    assessmentRawScore: 14,
    recruiterPriority: "high",
    role: {
      slug: "senior-ai-product-engineer",
      title: "Senior AI Product Engineer"
    }
  };
  const state = {
    application,
    paymentReport: paymentReport ? { ...paymentReport } : null
  };

  const repository = {
    findByAccessTokenHash: vi.fn(async (tokenHash) => {
      if (lookup !== "valid" || tokenHash !== hashToken(VERIFICATION_TOKEN)) {
        return null;
      }
      return { application: state.application, paymentReport: state.paymentReport };
    }),
    createAndClaim: vi.fn(async ({ payerName, reportedAt }) => {
      if (state.paymentReport) {
        return {
          application: state.application,
          paymentReport: state.paymentReport,
          notificationClaimed: false
        };
      }
      state.paymentReport = {
        id: "payment-report-1",
        applicationId: state.application.id,
        payerName,
        amountMinor: 299,
        currency: "EUR",
        reportedAt,
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "NOTIFICATION_IN_PROGRESS"
      };
      return {
        application: state.application,
        paymentReport: state.paymentReport,
        notificationClaimed: true
      };
    }),
    claimNotification: vi.fn(async ({ reportId }) => {
      if (
        !state.paymentReport ||
        state.paymentReport.id !== reportId ||
        state.paymentReport.notificationSentAt ||
        state.paymentReport.lastNotificationError === "NOTIFICATION_IN_PROGRESS"
      ) {
        return {
          application: state.application,
          paymentReport: state.paymentReport,
          notificationClaimed: false
        };
      }
      state.paymentReport.notificationAttemptCount += 1;
      state.paymentReport.lastNotificationError = "NOTIFICATION_IN_PROGRESS";
      return {
        application: state.application,
        paymentReport: state.paymentReport,
        notificationClaimed: true
      };
    }),
    markNotificationSent: vi.fn(async ({ reportId, sentAt }) => {
      if (state.paymentReport?.id === reportId) {
        state.paymentReport.notificationSentAt = sentAt;
        state.paymentReport.lastNotificationError = null;
      }
      return state.paymentReport;
    }),
    markNotificationFailed: vi.fn(async ({ reportId, errorCategory, failedAt }) => {
      if (state.paymentReport?.id === reportId) {
        state.paymentReport.lastNotificationError = errorCategory;
        state.paymentReport.notificationFailedAt = failedAt;
      }
      return state.paymentReport;
    })
  };
  const email = {
    enqueueWisePaymentReport: vi.fn(async () => {
      if (emailFailure) throw new Error("provider secret must not be persisted");
      return { providerMessageId: "email-1" };
    })
  };
  const service = createWisePaymentReportService({
    repository,
    email,
    clock: { now: () => new Date(NOW) }
  });

  return { application, email, repository, service, state };
}

function expectDomainError(promise, code, status = 422) {
  return expect(promise).rejects.toEqual(
    expect.objectContaining({
      name: "WisePaymentReportDomainError",
      code,
      status
    })
  );
}

describe("Wise payment report service", () => {
  test("creates, notifies, and returns the public reported state", async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName: "  Nino Beridze  "
      })
    ).resolves.toEqual({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(fixture.repository.findByAccessTokenHash).toHaveBeenCalledWith(
      hashToken(VERIFICATION_TOKEN),
      new Date("2026-07-11T10:00:00.000Z")
    );
    expect(fixture.repository.createAndClaim).toHaveBeenCalledWith({
      tokenHash: hashToken(VERIFICATION_TOKEN),
      payerName: "Nino Beridze",
      reportedAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.repository.markNotificationSent).toHaveBeenCalledWith({
      reportId: "payment-report-1",
      attemptNumber: 1,
      sentAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.email.enqueueWisePaymentReport).toHaveBeenCalledTimes(1);
    expect(fixture.email.enqueueWisePaymentReport).toHaveBeenCalledWith({
      application: fixture.application,
      paymentReport: expect.objectContaining({ payerName: "Nino Beridze" })
    });
  });

  test.each(["Łukasz Żółć", "ნინო ბერიძე"])(
    "accepts the Unicode payer name %s",
    async (payerName) => {
      const fixture = createFixture();

      await expect(
        fixture.service.reportPayment({
          verificationToken: VERIFICATION_TOKEN,
          payerName
        })
      ).resolves.toMatchObject({ state: "reported" });
      expect(fixture.repository.createAndClaim).toHaveBeenCalledWith(
        expect.objectContaining({ payerName })
      );
    }
  );

  test.each([
    ["blank", "   "],
    ["one code point", "N"],
    ["multiline", "Nino\nBeridze"],
    ["control character", "Nino\u0000Beridze"],
    ["surrogate", "Nino\uD800Beridze"],
    ["121 code points", "N".repeat(121)]
  ])("rejects %s payer names before persistence", async (_label, payerName) => {
    const fixture = createFixture();

    await expectDomainError(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName
      }),
      "PAYMENT_REPORT_NAME_INVALID"
    );
    expect(fixture.repository.createAndClaim).not.toHaveBeenCalled();
    expect(fixture.email.enqueueWisePaymentReport).not.toHaveBeenCalled();
  });

  test("requires a payer name for a first report", async () => {
    const fixture = createFixture();

    await expectDomainError(
      fixture.service.reportPayment({ verificationToken: VERIFICATION_TOKEN }),
      "PAYMENT_REPORT_NAME_REQUIRED"
    );
    expect(fixture.repository.createAndClaim).not.toHaveBeenCalled();
  });

  test.each([
    ["unknown", { lookup: "unknown" }, "PAYMENT_REPORT_INVALID", 404],
    ["expired", { lookup: "expired" }, "PAYMENT_REPORT_INVALID", 404],
    ["deleted", { lookup: "valid" }, "PAYMENT_REPORT_INVALID", 404]
  ])("rejects %s records without persistence", async (_label, options, code, status) => {
    const fixture = createFixture(options);
    if (_label === "deleted") fixture.application.deletedAt = NOW;

    await expectDomainError(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName: "Nino Beridze"
      }),
      code,
      status
    );
    expect(fixture.repository.createAndClaim).not.toHaveBeenCalled();
    expect(fixture.email.enqueueWisePaymentReport).not.toHaveBeenCalled();
  });

  test("rejects a non-submitted application without persistence", async () => {
    const fixture = createFixture({ lifecycleState: "assessment_started" });

    await expectDomainError(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName: "Nino Beridze"
      }),
      "PAYMENT_REPORT_UNAVAILABLE",
      409
    );
    expect(fixture.repository.createAndClaim).not.toHaveBeenCalled();
    expect(fixture.email.enqueueWisePaymentReport).not.toHaveBeenCalled();
  });

  test("returns reported for an already-notified report without another claim or email", async () => {
    const fixture = createFixture({
      paymentReport: {
        id: "payment-report-1",
        payerName: "Nino Beridze",
        reportedAt: NOW,
        notificationSentAt: NOW,
        notificationAttemptCount: 1,
        lastNotificationError: null
      }
    });

    await expect(
      fixture.service.reportPayment({ verificationToken: VERIFICATION_TOKEN })
    ).resolves.toEqual({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(fixture.repository.claimNotification).not.toHaveBeenCalled();
    expect(fixture.repository.createAndClaim).not.toHaveBeenCalled();
    expect(fixture.email.enqueueWisePaymentReport).not.toHaveBeenCalled();
  });

  test("returns pending for a fresh in-progress duplicate without another email", async () => {
    const fixture = createFixture({
      paymentReport: {
        id: "payment-report-1",
        payerName: "Nino Beridze",
        reportedAt: NOW,
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "NOTIFICATION_IN_PROGRESS"
      }
    });

    await expect(
      fixture.service.reportPayment({ verificationToken: VERIFICATION_TOKEN })
    ).resolves.toEqual({
      state: "notification_pending",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(fixture.repository.claimNotification).toHaveBeenCalledWith({
      reportId: "payment-report-1",
      claimedAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.email.enqueueWisePaymentReport).not.toHaveBeenCalled();
  });

  test("persists a safe email failure and returns pending", async () => {
    const fixture = createFixture({ emailFailure: true });

    await expect(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName: "Nino Beridze"
      })
    ).resolves.toEqual({
      state: "notification_pending",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(fixture.repository.markNotificationFailed).toHaveBeenCalledWith({
      reportId: "payment-report-1",
      attemptNumber: 1,
      errorCategory: "EMAIL_DELIVERY_FAILED",
      failedAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.state.paymentReport.lastNotificationError).toBe(
      "EMAIL_DELIVERY_FAILED"
    );
    expect(fixture.state.paymentReport).not.toHaveProperty(
      "providerErrorMessage"
    );
  });

  test("does not convert notification persistence errors into email failures", async () => {
    const fixture = createFixture();
    fixture.repository.markNotificationSent.mockRejectedValueOnce(
      new Error("database unavailable")
    );

    await expect(
      fixture.service.reportPayment({
        verificationToken: VERIFICATION_TOKEN,
        payerName: "Nino Beridze"
      })
    ).rejects.toThrow("database unavailable");
    expect(fixture.repository.markNotificationFailed).not.toHaveBeenCalled();
  });

  test("retries a pending report without a payer name and marks the same report sent", async () => {
    const fixture = createFixture({
      paymentReport: {
        id: "payment-report-1",
        payerName: "Nino Beridze",
        reportedAt: NOW,
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "EMAIL_DELIVERY_FAILED"
      }
    });

    await expect(
      fixture.service.reportPayment({ verificationToken: VERIFICATION_TOKEN })
    ).resolves.toEqual({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(fixture.repository.claimNotification).toHaveBeenCalledWith({
      reportId: "payment-report-1",
      claimedAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.email.enqueueWisePaymentReport).toHaveBeenCalledTimes(1);
    expect(fixture.repository.markNotificationSent).toHaveBeenCalledWith({
      reportId: "payment-report-1",
      attemptNumber: 2,
      sentAt: new Date("2026-07-11T10:00:00.000Z")
    });
    expect(fixture.state.paymentReport.id).toBe("payment-report-1");
  });

  test("does not change assessment score, priority, or lifecycle state", async () => {
    const fixture = createFixture();
    const before = {
      score: fixture.application.assessmentRawScore,
      priority: fixture.application.recruiterPriority,
      lifecycleState: fixture.application.lifecycleState
    };

    await fixture.service.reportPayment({
      verificationToken: VERIFICATION_TOKEN,
      payerName: "Nino Beridze"
    });

    expect(fixture.application).toMatchObject({
      assessmentRawScore: before.score,
      recruiterPriority: before.priority,
      lifecycleState: before.lifecycleState
    });
  });

  test("exposes the domain error contract", () => {
    const error = new WisePaymentReportDomainError("EXAMPLE", 422);

    expect(error).toMatchObject({
      name: "WisePaymentReportDomainError",
      message: "EXAMPLE",
      code: "EXAMPLE",
      status: 422
    });
  });
});
