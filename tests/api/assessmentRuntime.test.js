import { expect, test, vi } from "vitest";
import { createAssessmentRuntime } from "../../api/_lib/assessmentRuntime.js";

test("composes the live assessment service with deterministic token security", () => {
  const client = { rpc: vi.fn() };
  const service = createAssessmentRuntime({
    env: {
      PUBLIC_SITE_URL: "https://auralis.studio",
      HIRING_EMAIL_FROM: "Auralis Careers <auralis.careers@gmail.com>",
      HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me",
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
    },
    client,
    emailClient: { emails: { send: vi.fn() } }
  });

  expect(service).toEqual(
    expect.objectContaining({
      getAssessment: expect.any(Function),
      startAssessment: expect.any(Function),
      saveAnswer: expect.any(Function),
      submitAssessment: expect.any(Function),
      sendDueReminders: expect.any(Function)
    })
  );
});
