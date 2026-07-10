import { describe, expect, test } from "vitest";
import { createTestHiringRuntime } from "../../api/_lib/testHiringRuntime.js";

describe("deterministic hiring providers", () => {
  test("uses fixed hosted-payment semantics and explicit provider controls", async () => {
    const runtime = createTestHiringRuntime();
    const hosted = await runtime.providers.payment.createHostedSession({
      merchantPaymentId: "VERIFY-AUR-1",
      returnUrl: "https://auralis.test/application/AUR-1/complete/token",
      callbackUrl: "https://auralis.test/api/payments/tbc/callback"
    });

    await expect(
      runtime.providers.payment.getPayment(hosted.providerPaymentId)
    ).resolves.toMatchObject({
      state: "created",
      amountMinor: 299,
      currency: "EUR",
      preAuth: true,
      merchantPaymentId: "VERIFY-AUR-1"
    });

    runtime.providers.controls.authorizePayment(hosted.providerPaymentId);
    await expect(
      runtime.providers.payment.getPayment(hosted.providerPaymentId)
    ).resolves.toMatchObject({ state: "authorized" });
    await runtime.providers.payment.cancelPayment(hosted.providerPaymentId);
    expect(runtime.providers.state.paymentCancellations).toEqual([
      hosted.providerPaymentId
    ]);
  });

  test("records private email and storage activity without network calls", async () => {
    const runtime = createTestHiringRuntime();
    runtime.providers.controls.uploadObject("campaign/cv.pdf", {
      contentType: "application/pdf",
      size: 2048
    });

    await expect(
      runtime.providers.storage.confirmObject("campaign/cv.pdf")
    ).resolves.toEqual({
      objectKey: "campaign/cv.pdf",
      contentType: "application/pdf",
      size: 2048
    });
    await runtime.providers.email.enqueueRecruiterApplication({
      to: "auralis.careers@proton.me",
      application: { id: "application-1" },
      recruiterToken: "private-recruiter-token",
      assessmentToken: "private-assessment-token"
    });
    expect(runtime.providers.state.emails).toEqual([
      expect.objectContaining({
        type: "recruiter_application",
        to: "auralis.careers@proton.me",
        assessmentToken: "private-assessment-token"
      })
    ]);
  });
});
