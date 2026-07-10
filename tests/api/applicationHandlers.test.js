import { describe, expect, test, vi } from "vitest";
import { ApplicationDomainError } from "../../api/_lib/applicationService.js";
import { createCampaignHandler } from "../../api/campaigns/[roleSlug]/[campaignToken].js";
import { createUploadUrlHandler } from "../../api/applications/upload-url.js";
import { createApplicationHandler } from "../../api/applications/index.js";
import { createRecruiterCvHandler } from "../../api/recruiter/cv/[token].js";

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    redirectUrl: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
    end() {
      return this;
    }
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    query: {},
    body: {},
    socket: { remoteAddress: "203.0.113.7" },
    ...overrides
  };
}

const validPayload = {
  fullName: "Nino Beridze",
  email: "nino@example.com",
  country: "Georgia",
  timeZone: "Asia/Tbilisi",
  profileUrl: "https://www.linkedin.com/in/nino-beridze",
  availability: "20-30 hours",
  cvObjectKey:
    "550e8400-e29b-41d4-a716-446655440000/upload-token/cv.pdf",
  cvMimeType: "application/pdf",
  cvSize: 2048,
  privacyAccepted: true
};

describe("application handlers", () => {
  test("serves a valid campaign with private cache headers", async () => {
    const service = {
      validateCampaign: vi.fn(async () => ({ id: "campaign-id" }))
    };
    const handler = createCampaignHandler(service);
    const response = createResponse();

    await handler(
      request({
        method: "GET",
        query: {
          roleSlug: "senior-ai-product-engineer",
          campaignToken: "private-campaign-token"
        }
      }),
      response
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ campaign: { id: "campaign-id" } });
  });

  test("rejects an unsupported method", async () => {
    const handler = createCampaignHandler({ validateCampaign: vi.fn() });
    const response = createResponse();

    await handler(request({ method: "DELETE" }), response);

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe("GET");
    expect(response.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("lists active direct-application roles without exposing a campaign", async () => {
    const service = {
      listApplicationRoles: vi.fn(async () => [
        { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" }
      ])
    };
    const handler = createApplicationHandler(service);
    const response = createResponse();

    await handler(request({ method: "GET" }), response);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      roles: [{ slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" }]
    });
  });

  test("validates and delegates a direct PDF upload request", async () => {
    const service = {
      createUploadUrl: vi.fn(async () => ({ uploadToken: "signed-token" }))
    };
    const handler = createUploadUrlHandler(service);
    const response = createResponse();
    const body = {
      roleSlug: "senior-ai-product-engineer",
      email: "nino@example.com",
      fileName: "nino-cv.pdf",
      mimeType: "application/pdf",
      size: 2048,
      website: ""
    };

    await handler(request({ body }), response);

    expect(response.statusCode).toBe(200);
    expect(service.createUploadUrl).toHaveBeenCalledWith(body);
    expect(response.body).toEqual({ upload: { uploadToken: "signed-token" } });
  });

  test("creates a direct application without a campaign token", async () => {
    const service = {
      submitApplication: vi.fn(async () => ({ applicationReference: "AUR-1" }))
    };
    const handler = createApplicationHandler(service);
    const response = createResponse();
    const body = {
      roleSlug: "senior-ai-product-engineer",
      website: "",
      payload: validPayload
    };

    await handler(
      request({
        headers: {
          "content-type": "application/json",
          "idempotency-key": "submission-123"
        },
        body
      }),
      response
    );

    expect(response.statusCode).toBe(201);
    expect(service.submitApplication).toHaveBeenCalledWith({
      ...body,
      idempotencyKey: "submission-123"
    });
  });

  test("rejects non-JSON and oversized request bodies", async () => {
    const service = { submitApplication: vi.fn() };
    const handler = createApplicationHandler(service);
    const nonJsonResponse = createResponse();
    const oversizedResponse = createResponse();

    await handler(
      request({ headers: { "content-type": "text/plain" } }),
      nonJsonResponse
    );
    await handler(
      request({
        headers: {
          "content-type": "application/json",
          "content-length": "40000"
        }
      }),
      oversizedResponse
    );

    expect(nonJsonResponse.statusCode).toBe(415);
    expect(oversizedResponse.statusCode).toBe(413);
    expect(service.submitApplication).not.toHaveBeenCalled();
  });

  test("requires an idempotency key for application creation", async () => {
    const handler = createApplicationHandler({ submitApplication: vi.fn() });
    const response = createResponse();

    await handler(
      request({
        body: {
          roleSlug: "senior-ai-product-engineer",
          campaignToken: "private-campaign-token",
          website: "",
          payload: validPayload
        }
      }),
      response
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  test("maps domain errors to stable structured JSON", async () => {
    const handler = createApplicationHandler({
      submitApplication: vi.fn(async () => {
        throw new ApplicationDomainError("CAMPAIGN_UNAVAILABLE", 404);
      })
    });
    const response = createResponse();

    await handler(
      request({
        headers: {
          "content-type": "application/json",
          "idempotency-key": "submission-123"
        },
        body: {
          roleSlug: "senior-ai-product-engineer",
          campaignToken: "private-campaign-token",
          website: "",
          payload: validPayload
        }
      }),
      response
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: { code: "CAMPAIGN_UNAVAILABLE" }
    });
  });

  test("rejects a filled bot-trap field before signing a CV upload", async () => {
    const service = { createUploadUrl: vi.fn() };
    const handler = createUploadUrlHandler(service);
    const response = createResponse();

    await handler(
      request({
        body: {
          campaignId: "550e8400-e29b-41d4-a716-446655440000",
          email: "bot@example.com",
          fileName: "cv.pdf",
          mimeType: "application/pdf",
          size: 2048,
          website: "https://spam.example"
        }
      }),
      response
    );

    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({ error: { code: "INVALID_CV" } });
    expect(service.createUploadUrl).not.toHaveBeenCalled();
  });

  test("rejects a filled bot-trap field before creating an application", async () => {
    const service = { submitApplication: vi.fn() };
    const handler = createApplicationHandler(service);
    const response = createResponse();

    await handler(
      request({
        headers: {
          "content-type": "application/json",
          "idempotency-key": "submission-123"
        },
        body: {
          roleSlug: "senior-ai-product-engineer",
          campaignToken: "private-campaign-token",
          website: "https://spam.example",
          payload: validPayload
        }
      }),
      response
    );

    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({ error: { code: "INVALID_APPLICATION" } });
    expect(service.submitApplication).not.toHaveBeenCalled();
  });

  test("redirects only to the configured HTTPS Supabase storage host", async () => {
    const secureHandler = createRecruiterCvHandler(
      {
        getRecruiterCv: vi.fn(async () => ({
          url: "https://project-ref.supabase.co/storage/v1/object/sign/hiring-cvs/cv.pdf"
        }))
      },
      { allowedStorageHost: "project-ref.supabase.co" }
    );
    const rejectedHandler = createRecruiterCvHandler(
      {
        getRecruiterCv: vi.fn(async () => ({
          url: "https://attacker.example/redirect"
        }))
      },
      { allowedStorageHost: "project-ref.supabase.co" }
    );
    const secureResponse = createResponse();
    const rejectedResponse = createResponse();

    await secureHandler(
      request({ method: "GET", query: { token: "private-recruiter-token" } }),
      secureResponse
    );
    await rejectedHandler(
      request({ method: "GET", query: { token: "private-recruiter-token" } }),
      rejectedResponse
    );

    expect(secureResponse.statusCode).toBe(302);
    expect(secureResponse.redirectUrl).toContain("project-ref.supabase.co");
    expect(rejectedResponse.statusCode).toBe(502);
    expect(rejectedResponse.redirectUrl).toBeNull();
  });
});
