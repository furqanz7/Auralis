import { expect, test, vi } from "vitest";
import {
  createVerificationRuntime,
  createVerificationStatusRuntime
} from "../../api/_lib/verificationRuntime.js";

test("composes hosted verification from private provider adapters", () => {
  const client = { rpc: vi.fn() };
  const service = createVerificationRuntime({
    env: {
      PUBLIC_SITE_URL: "https://auralis.studio",
      RESEND_FROM: "Auralis Hiring <onboarding@resend.dev>",
      HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me",
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters",
      TBC_BASE_URL: "https://api.tbcbank.ge",
      TBC_CHECKOUT_HOST: "tpay.tbcbank.ge",
      TBC_API_KEY: "developer-api-key",
      TBC_CLIENT_ID: "merchant-client-id",
      TBC_CLIENT_SECRET: "merchant-client-secret"
    },
    client,
    emailClient: { emails: { send: vi.fn() } },
    fetchImpl: vi.fn()
  });

  expect(service).toEqual(
    expect.objectContaining({
      createSession: expect.any(Function),
      handleCallback: expect.any(Function),
      getStatus: expect.any(Function),
      retryCancellation: expect.any(Function),
      retryDueCancellations: expect.any(Function)
    })
  );
});

test("composes verification status without payment-provider credentials", () => {
  const service = createVerificationStatusRuntime({
    client: { rpc: vi.fn() },
    wisePaymentUrl: "https://wise.com/pay/r/nAx15LFiReIdtjc"
  });

  expect(service).toEqual({ getStatus: expect.any(Function) });
});
