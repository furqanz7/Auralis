import { describe, expect, test, vi } from "vitest";
import {
  HiringApiError,
  createHiringClient
} from "../../src/hiring/api/hiringClient.js";

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}

describe("hiring browser client", () => {
  test("loads the available roles for the unlisted direct application page", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ roles: [{ slug: "senior-ai-product-engineer" }] })
    );
    const client = createHiringClient(fetchImpl);

    await expect(client.getApplicationRoles()).resolves.toEqual([
      { slug: "senior-ai-product-engineer" }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/applications",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  test("loads an encoded private campaign without cache", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ campaign: { id: "campaign-id" } })
    );
    const client = createHiringClient(fetchImpl);

    await expect(client.getCampaign("role slug", "token/value")).resolves.toEqual({
      id: "campaign-id"
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/campaigns/role%20slug/token%2Fvalue",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  test("creates and completes a signed PDF upload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          upload: {
            objectKey: "campaign/upload/cv.pdf",
            uploadUrl: "https://project-ref.supabase.co/storage/upload"
          }
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const client = createHiringClient(fetchImpl);
    const request = {
      campaignId: "550e8400-e29b-41d4-a716-446655440000",
      email: "nino@example.com",
      fileName: "cv.pdf",
      mimeType: "application/pdf",
      size: 2
    };
    const file = new File(["cv"], "cv.pdf", { type: "application/pdf" });

    const upload = await client.createUploadUrl(request);
    await client.uploadCv(upload, file);

    expect(fetchImpl.mock.calls[0][0]).toBe("/api/applications/upload-url");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(request);
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: expect.any(FormData)
    });
  });

  test("submits with a stable idempotency header", async () => {
    const fetchImpl = vi.fn(async () =>
      response({ applicationReference: "AUR-1" }, { status: 201 })
    );
    const client = createHiringClient(fetchImpl);

    await client.submitApplication({ roleSlug: "role" }, "submission-123");

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/applications",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "submission-123"
        })
      })
    );
  });

  test("maps structured API failures", async () => {
    const client = createHiringClient(
      vi.fn(async () =>
        response(
          { error: { code: "CAMPAIGN_UNAVAILABLE" } },
          { ok: false, status: 404 }
        )
      )
    );

    await expect(client.getCampaign("role", "token")).rejects.toEqual(
      expect.objectContaining({
        name: "HiringApiError",
        code: "CAMPAIGN_UNAVAILABLE",
        status: 404
      })
    );
    expect(HiringApiError).toBeTypeOf("function");
  });

  test("reads and starts a private assessment without accepting a client timer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "invited" }))
      .mockResolvedValueOnce(
        response({ status: "started", deadlineAt: "2026-07-10T12:20:00.000Z" })
      );
    const client = createHiringClient(fetchImpl);

    await client.getAssessment("token/value");
    await client.startAssessment("token/value");

    expect(fetchImpl.mock.calls[0]).toEqual([
      "/api/assessments/token%2Fvalue",
      expect.objectContaining({ cache: "no-store" })
    ]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      "/api/assessments/token%2Fvalue/start",
      expect.objectContaining({ method: "POST", body: "{}" })
    ]);
  });

  test("saves a versioned answer and submits without browser scoring data", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ version: 4, savedAt: "now" }))
      .mockResolvedValueOnce(
        response({ applicationReference: "AUR-1", verificationToken: "private" })
      );
    const client = createHiringClient(fetchImpl);

    await client.saveAssessmentAnswer("private token", "question/1", "option-a", 3);
    await client.submitAssessment("private token");

    expect(fetchImpl.mock.calls[0]).toEqual([
      "/api/assessments/private%20token/answers/question%2F1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ optionId: "option-a", version: 3 })
      })
    ]);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "/api/assessments/private%20token/submit"
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({});
  });

  test("creates and reads a private hosted verification session", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({ approvalUrl: "https://tpay.tbcbank.ge/checkout/payment-1" })
      )
      .mockResolvedValueOnce(
        response({ state: "processing", applicationReference: "AUR-1" })
      );
    const client = createHiringClient(fetchImpl);

    await client.createVerificationSession(
      "verification/token",
      "verification-session-1"
    );
    await client.getVerificationStatus("verification/token");

    expect(fetchImpl.mock.calls[0]).toEqual([
      "/api/verifications/verification%2Ftoken/session",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          "Idempotency-Key": "verification-session-1"
        })
      })
    ]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      "/api/verifications/verification%2Ftoken/status",
      expect.objectContaining({ cache: "no-store" })
    ]);
  });

  test("reports and retries a Wise payment with strict encoded bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          state: "reported",
          reportedAt: "2026-07-11T10:00:00.000Z"
        })
      )
      .mockResolvedValueOnce(
        response({
          state: "notification_pending",
          reportedAt: "2026-07-11T10:00:00.000Z"
        })
      );
    const client = createHiringClient(fetchImpl);

    await client.reportWisePayment("verification/token", "Nino Beridze");
    await client.reportWisePayment("verification/token");

    expect(fetchImpl.mock.calls[0]).toEqual([
      "/api/verifications/verification%2Ftoken/payment-report",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ payerName: "Nino Beridze" })
      })
    ]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      "/api/verifications/verification%2Ftoken/payment-report",
      expect.objectContaining({ method: "POST", body: "{}" })
    ]);
  });

  test("requests and confirms privacy deletion with strict JSON bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ accepted: true }, { status: 202 }))
      .mockResolvedValueOnce(response({ deleted: true }));
    const client = createHiringClient(fetchImpl);

    await client.requestPrivacyDeletion("nino@example.com");
    await client.confirmPrivacyDeletion("privacy/token");

    expect(fetchImpl.mock.calls[0]).toEqual([
      "/api/privacy/delete-request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "nino@example.com" })
      })
    ]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      "/api/privacy/delete-confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deletionToken: "privacy/token" })
      })
    ]);
  });
});
