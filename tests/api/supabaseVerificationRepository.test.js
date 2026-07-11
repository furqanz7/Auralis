import { describe, expect, test, vi } from "vitest";
import {
  createSupabaseVerificationRepository,
  createSupabaseWisePaymentReportRepository
} from "../../api/_lib/adapters/supabase.js";

const application = {
  id: "application-1",
  reference: "AUR-1",
  full_name: "Nino Beridze",
  email: "nino@example.com",
  lifecycle_state: "assessment_submitted",
  cv_object_key: "campaign/upload/cv.pdf",
  role: {
    id: "role-1",
    slug: "senior-ai-product-engineer",
    title: "Senior AI Product Engineer"
  }
};

const verificationPayload = {
  id: "verification-1",
  merchant_reference: "VERIFY-AUR-1",
  provider_payment_id: "tpay-payment-1",
  amount_minor: 299,
  currency: "EUR",
  pre_auth: true,
  idempotency_key: "verification-session-1",
  approval_url: "https://tpay.tbcbank.ge/checkout/tpay-payment-1",
  session_expires_at: "2026-07-10T12:12:00.000Z",
  return_token_hash: "a".repeat(64),
  return_token_expires_at: "2026-07-13T12:00:00.000Z",
  state: "pending",
  provider_state: null,
  cancellation_state: "not_requested",
  cancellation_attempt_count: 0,
  next_retry_at: null,
  callback_received_at: null,
  completed_at: null,
  failed_at: null,
  error_category: null,
  application
};

const paymentReportPayload = {
  id: "wise-report-1",
  application_id: "application-1",
  payer_name: "Nino Beridze",
  amount_minor: 299,
  currency: "EUR",
  reported_at: "2026-07-11T10:00:00.000Z",
  notification_sent_at: null,
  notification_attempt_count: 1,
  last_notification_error: "NOTIFICATION_IN_PROGRESS"
};

function fixture(overrides = {}) {
  const defaults = {
    get_hiring_application_for_verification: application,
    reserve_hiring_payment_verification: {
      ...verificationPayload,
      newly_created: true
    },
    activate_hiring_payment_verification: verificationPayload,
    get_hiring_verification_by_provider_payment: verificationPayload,
    get_hiring_verification_by_id: verificationPayload,
    begin_hiring_verification_cancellation: true,
    complete_hiring_verification_cancellation: true,
    fail_hiring_payment_verification: true,
    schedule_hiring_verification_retry: true,
    get_hiring_verification_by_token: {
      ...verificationPayload,
      payment_report: paymentReportPayload
    },
    claim_hiring_verification_retries: [
      {
        ...verificationPayload,
        state: "processing",
        cancellation_state: "processing",
        cancellation_attempt_count: 2
      }
    ]
  };
  const rpc = vi.fn(async (name) => ({
    data: name in overrides ? overrides[name] : defaults[name],
    error: null
  }));
  return {
    repository: createSupabaseVerificationRepository({ client: { rpc } }),
    rpc
  };
}

describe("Supabase verification repository", () => {
  test("loads an eligible application from a private verification token", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-10T12:00:00.000Z");

    await expect(
      repository.findApplicationByVerificationTokenHash("b".repeat(64), now)
    ).resolves.toEqual({
      id: "application-1",
      reference: "AUR-1",
      fullName: "Nino Beridze",
      email: "nino@example.com",
      lifecycleState: "assessment_submitted",
      cvObjectKey: "campaign/upload/cv.pdf",
      role: {
        id: "role-1",
        slug: "senior-ai-product-engineer",
        title: "Senior AI Product Engineer"
      }
    });
    expect(rpc).toHaveBeenCalledWith(
      "get_hiring_application_for_verification",
      { p_token_hash: "b".repeat(64), p_now: now.toISOString() }
    );
  });

  test("reserves and activates a provider handoff", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-10T12:00:00.000Z");
    const app = await repository.findApplicationByVerificationTokenHash(
      "b".repeat(64),
      now
    );

    await expect(
      repository.reserveVerification({
        application: app,
        merchantReference: "VERIFY-AUR-1",
        idempotencyKey: "verification-session-1",
        returnTokenHash: "a".repeat(64),
        returnTokenExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
        amountMinor: 299,
        currency: "EUR",
        preAuth: true,
        createdAt: now
      })
    ).resolves.toMatchObject({
      newlyCreated: true,
      verification: {
        id: "verification-1",
        merchantReference: "VERIFY-AUR-1",
        application: { reference: "AUR-1" }
      }
    });
    await expect(
      repository.activateVerification({
        verificationId: "verification-1",
        providerPaymentId: "tpay-payment-1",
        approvalUrl: "https://tpay.tbcbank.ge/checkout/tpay-payment-1",
        sessionExpiresAt: new Date("2026-07-10T12:12:00.000Z"),
        activatedAt: now
      })
    ).resolves.toMatchObject({ providerPaymentId: "tpay-payment-1" });
    expect(rpc).toHaveBeenCalledWith(
      "reserve_hiring_payment_verification",
      expect.objectContaining({ p_amount_minor: 299, p_currency: "EUR" })
    );
  });

  test("maps compare-and-set cancellation transitions", async () => {
    const { repository } = fixture();
    const now = new Date("2026-07-10T12:00:00.000Z");

    await expect(
      repository.beginCancellation({
        verificationId: "verification-1",
        providerState: "authorized",
        callbackAt: now
      })
    ).resolves.toMatchObject({ acquired: true });
    await expect(
      repository.completeCancellation({
        verificationId: "verification-1",
        completedAt: now
      })
    ).resolves.toMatchObject({ newlyCompleted: true });
    await expect(
      repository.failVerification({
        verificationId: "verification-1",
        providerState: "unknown",
        errorCategory: "PROVIDER_MISMATCH",
        failedAt: now
      })
    ).resolves.toMatchObject({ newlyFailed: true });
  });

  test("loads browser status and atomically claimed retries", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-10T12:05:00.000Z");

    await expect(
      repository.findByAccessTokenHash("c".repeat(64), now)
    ).resolves.toMatchObject({
      application: { email: "nino@example.com" },
      verification: { state: "pending", amountMinor: 299 },
      paymentReport: {
        id: "wise-report-1",
        payerName: "Nino Beridze",
        amountMinor: 299,
        currency: "EUR",
        reportedAt: new Date("2026-07-11T10:00:00.000Z"),
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "NOTIFICATION_IN_PROGRESS"
      }
    });
    await expect(
      repository.claimDueCancellations({ now, limit: 20 })
    ).resolves.toEqual([
      expect.objectContaining({
        state: "processing",
        cancellationAttemptCount: 2
      })
    ]);
    expect(rpc).toHaveBeenCalledWith("claim_hiring_verification_retries", {
      p_now: now.toISOString(),
      p_limit: 20
    });
  });
});

describe("Supabase Wise payment report repository", () => {
  function wiseFixture(overrides = {}) {
    const defaults = {
      get_hiring_verification_by_token: {
        application,
        verification: null,
        payment_report: paymentReportPayload
      },
      create_hiring_wise_payment_report: {
        application,
        payment_report: paymentReportPayload,
        notification_claimed: true
      },
      claim_hiring_wise_payment_report_notification: {
        application,
        payment_report: {
          ...paymentReportPayload,
          notification_attempt_count: 2
        },
        notification_claimed: true
      },
      mark_hiring_wise_payment_report_sent: {
        ...paymentReportPayload,
        notification_sent_at: "2026-07-11T10:01:00.000Z",
        last_notification_error: null
      },
      mark_hiring_wise_payment_report_failed: {
        ...paymentReportPayload,
        last_notification_error: "EMAIL_DELIVERY_FAILED"
      }
    };
    const rpc = vi.fn(async (name) => ({
      data: name in overrides ? overrides[name] : defaults[name],
      error: null
    }));
    return {
      repository: createSupabaseWisePaymentReportRepository({ client: { rpc } }),
      rpc
    };
  }

  test("maps verification status payment-report dates and claim metadata", async () => {
    const { repository, rpc } = wiseFixture();
    const now = new Date("2026-07-11T10:00:30.000Z");

    await expect(
      repository.findByAccessTokenHash("d".repeat(64), now)
    ).resolves.toEqual({
      application: expect.objectContaining({ id: "application-1" }),
      paymentReport: {
        id: "wise-report-1",
        applicationId: "application-1",
        payerName: "Nino Beridze",
        amountMinor: 299,
        currency: "EUR",
        reportedAt: new Date("2026-07-11T10:00:00.000Z"),
        notificationSentAt: null,
        notificationAttemptCount: 1,
        lastNotificationError: "NOTIFICATION_IN_PROGRESS"
      }
    });
    expect(rpc).toHaveBeenCalledWith("get_hiring_verification_by_token", {
      p_token_hash: "d".repeat(64),
      p_now: now.toISOString()
    });
  });

  test("creates and claims a report with exact RPC argument names", async () => {
    const { repository, rpc } = wiseFixture();
    const reportedAt = new Date("2026-07-11T10:00:00.000Z");

    await expect(
      repository.createAndClaim({
        tokenHash: "e".repeat(64),
        payerName: "Nino Beridze",
        reportedAt
      })
    ).resolves.toMatchObject({
      application: { id: "application-1" },
      paymentReport: { id: "wise-report-1" },
      notificationClaimed: true
    });
    expect(rpc).toHaveBeenCalledWith("create_hiring_wise_payment_report", {
      p_token_hash: "e".repeat(64),
      p_payer_name: "Nino Beridze",
      p_now: reportedAt.toISOString()
    });
  });

  test("claims notification delivery with an ISO claim timestamp", async () => {
    const { repository, rpc } = wiseFixture();
    const claimedAt = new Date("2026-07-11T10:05:00.000Z");

    await expect(
      repository.claimNotification({
        reportId: "wise-report-1",
        claimedAt
      })
    ).resolves.toMatchObject({
      paymentReport: { notificationAttemptCount: 2 },
      notificationClaimed: true
    });
    expect(rpc).toHaveBeenCalledWith(
      "claim_hiring_wise_payment_report_notification",
      {
        p_report_id: "wise-report-1",
        p_now: claimedAt.toISOString()
      }
    );
  });

  test("marks the expected attempt sent or failed using ISO timestamps", async () => {
    const { repository, rpc } = wiseFixture();
    const sentAt = new Date("2026-07-11T10:01:00.000Z");
    const failedAt = new Date("2026-07-11T10:02:00.000Z");

    await expect(
      repository.markNotificationSent({
        reportId: "wise-report-1",
        attemptNumber: 1,
        sentAt
      })
    ).resolves.toMatchObject({
      notificationSentAt: sentAt,
      lastNotificationError: null
    });
    expect(rpc).toHaveBeenCalledWith("mark_hiring_wise_payment_report_sent", {
      p_report_id: "wise-report-1",
      p_attempt_number: 1,
      p_sent_at: sentAt.toISOString()
    });

    await expect(
      repository.markNotificationFailed({
        reportId: "wise-report-1",
        attemptNumber: 1,
        errorCategory: "EMAIL_DELIVERY_FAILED",
        failedAt
      })
    ).resolves.toMatchObject({
      notificationSentAt: null,
      lastNotificationError: "EMAIL_DELIVERY_FAILED"
    });
    expect(rpc).toHaveBeenCalledWith("mark_hiring_wise_payment_report_failed", {
      p_report_id: "wise-report-1",
      p_attempt_number: 1,
      p_error_category: "EMAIL_DELIVERY_FAILED",
      p_failed_at: failedAt.toISOString()
    });
  });
});
