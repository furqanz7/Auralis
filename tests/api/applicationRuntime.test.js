import { expect, test, vi } from "vitest";
import { createApplicationRuntime } from "../../api/_lib/applicationRuntime.js";

test("composes the Phase 1 service from server-only provider adapters", () => {
  const bucketApi = {};
  const client = {
    rpc: vi.fn(),
    storage: { from: vi.fn(() => bucketApi) }
  };
  const service = createApplicationRuntime({
    env: {
      PUBLIC_SITE_URL: "https://auralis.studio",
      SUPABASE_CV_BUCKET: "hiring-cvs",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      RESEND_FROM: "Auralis Hiring <onboarding@resend.dev>",
      HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me",
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
    },
    client,
    emailClient: { emails: { send: vi.fn() } },
    fetchImpl: vi.fn()
  });

  expect(client.storage.from).toHaveBeenCalledWith("hiring-cvs");
  expect(service).toEqual(
    expect.objectContaining({
      validateCampaign: expect.any(Function),
      createUploadUrl: expect.any(Function),
      submitApplication: expect.any(Function),
      getRecruiterCv: expect.any(Function)
    })
  );
});
