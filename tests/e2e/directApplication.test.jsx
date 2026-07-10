import { describe, expect, test } from "vitest";
import { createTestHiringRuntime } from "../../api/_lib/testHiringRuntime.js";

describe("direct application flow", () => {
  test("accepts an unlisted role selection and sends only the internal review email", async () => {
    const runtime = createTestHiringRuntime();
    const roles = await runtime.application.listApplicationRoles();
    const role = roles[0];
    const upload = await runtime.application.createUploadUrl({
      roleSlug: role.slug,
      email: "nino@example.com",
      fileName: "nino-cv.pdf",
      mimeType: "application/pdf",
      size: 2048
    });
    runtime.providers.controls.uploadObject(upload.objectKey, {
      contentType: "application/pdf",
      size: 2048
    });

    const result = await runtime.application.submitApplication({
      idempotencyKey: "direct-e2e-application-1",
      roleSlug: role.slug,
      payload: {
        fullName: "Nino Beridze",
        email: "nino@example.com",
        country: "Georgia",
        timeZone: "Asia/Tbilisi",
        profileUrl: "https://www.linkedin.com/in/nino-beridze",
        availability: "20-30 hours",
        cvObjectKey: upload.objectKey,
        cvMimeType: "application/pdf",
        cvSize: 2048,
        privacyAccepted: true
      }
    });

    expect(result.applicationReference).toBe("AUR-1");
    expect(runtime.providers.state.applications[0].campaign.label).toBe(
      "Direct application intake"
    );
    expect(runtime.providers.state.emails).toHaveLength(1);
    expect(runtime.providers.state.emails[0]).toMatchObject({
      type: "recruiter_application",
      to: "auralis.careers@proton.me"
    });
    expect(runtime.providers.state.emails[0].assessmentToken).toEqual(
      expect.any(String)
    );
  });
});
