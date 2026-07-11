import { expect, test, vi } from "vitest";
import { createWisePaymentReportRuntime } from "../../api/_lib/wisePaymentReportRuntime.js";

test("composes the live Wise report service from server-only adapters", () => {
  const service = createWisePaymentReportRuntime({
    env: {
      PUBLIC_SITE_URL: "https://auralis.studio",
      RESEND_FROM: "Auralis Hiring <onboarding@resend.dev>",
      HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me"
    },
    client: { rpc: vi.fn() },
    emailClient: { emails: { send: vi.fn() } }
  });

  expect(service).toEqual(
    expect.objectContaining({ reportPayment: expect.any(Function) })
  );
});
