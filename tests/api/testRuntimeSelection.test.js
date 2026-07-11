import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("test provider runtime selection", () => {
  test("selects one shared deterministic system without live credentials", async () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://auralis.test");
    vi.stubEnv("HIRING_PROVIDER_MODE", "test");
    vi.stubEnv(
      "HIRING_TOKEN_SECRET",
      "assessment-secret-with-at-least-32-characters"
    );

    const [{ getApplicationRuntimeService }, { getAssessmentRuntimeService },
      { getVerificationRuntimeService }, { getPrivacyRuntimeService },
      { getWisePaymentReportRuntimeService }] =
      await Promise.all([
        import("../../api/_lib/applicationRuntime.js"),
        import("../../api/_lib/assessmentRuntime.js"),
        import("../../api/_lib/verificationRuntime.js"),
        import("../../api/_lib/privacyRuntime.js"),
        import("../../api/_lib/wisePaymentReportRuntime.js")
      ]);

    expect(getApplicationRuntimeService()).toEqual(
      expect.objectContaining({ submitApplication: expect.any(Function) })
    );
    expect(getAssessmentRuntimeService()).toEqual(
      expect.objectContaining({ startAssessment: expect.any(Function) })
    );
    expect(getVerificationRuntimeService()).toEqual(
      expect.objectContaining({ handleCallback: expect.any(Function) })
    );
    expect(getPrivacyRuntimeService()).toEqual(
      expect.objectContaining({ purgeExpiredApplications: expect.any(Function) })
    );
    expect(getWisePaymentReportRuntimeService()).toEqual(
      expect.objectContaining({ reportPayment: expect.any(Function) })
    );
  });
});
