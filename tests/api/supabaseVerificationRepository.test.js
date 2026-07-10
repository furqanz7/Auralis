import { describe, expect, test, vi } from "vitest";
import { createSupabaseVerificationRepository } from "../../api/_lib/adapters/supabase.js";

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
    get_hiring_verification_by_token: verificationPayload,
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
      verification: { state: "pending", amountMinor: 299 }
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
