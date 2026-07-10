import { describe, expect, test, vi } from "vitest";
import { createPrivacyRuntime } from "../../api/_lib/privacyRuntime.js";
import { createPrivacyDeleteConfirmHandler } from "../../api/privacy/delete-confirm.js";
import { createHiringRetentionHandler } from "../../api/cron/hiring-retention.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
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
    }
  };
}

describe("privacy infrastructure", () => {
  test("composes privacy behavior from private provider adapters", () => {
    const service = createPrivacyRuntime({
      env: {
        PUBLIC_SITE_URL: "https://auralis.studio",
        SUPABASE_CV_BUCKET: "hiring-cvs",
        RESEND_FROM: "Auralis Hiring <onboarding@resend.dev>",
        HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me"
      },
      client: {
        rpc: vi.fn(),
        storage: { from: vi.fn(() => ({})) }
      },
      emailClient: { emails: { send: vi.fn() } }
    });

    expect(service).toEqual(
      expect.objectContaining({
        requestDeletion: expect.any(Function),
        confirmDeletion: expect.any(Function),
        purgeExpiredApplications: expect.any(Function)
      })
    );
  });

  test("confirms only a strict POST body and never caches the token response", async () => {
    const service = {
      confirmDeletion: vi.fn(async () => ({ deleted: true }))
    };
    const handler = createPrivacyDeleteConfirmHandler(service);
    const result = response();

    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { deletionToken: "privacy-token-with-enough-entropy" }
      },
      result
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ deleted: true });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(service.confirmDeletion).toHaveBeenCalledWith({
      deletionToken: "privacy-token-with-enough-entropy"
    });

    const injected = response();
    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {
          deletionToken: "privacy-token-with-enough-entropy",
          applicationId: "application-1"
        }
      },
      injected
    );
    expect(injected.statusCode).toBe(422);
  });

  test("authenticates the daily retention cron and bounds the batch", async () => {
    const service = {
      purgeExpiredApplications: vi.fn(async () => ({
        claimed: 2,
        deleted: 2,
        failed: 0
      }))
    };
    const handler = createHiringRetentionHandler({
      service,
      cronSecret: "cron-secret-with-at-least-32-characters"
    });
    const denied = response();
    await handler({ method: "GET", headers: {} }, denied);
    expect(denied.statusCode).toBe(401);

    const result = response();
    await handler(
      {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret-with-at-least-32-characters"
        }
      },
      result
    );
    expect(result.statusCode).toBe(200);
    expect(service.purgeExpiredApplications).toHaveBeenCalledWith({ limit: 25 });
    expect(result.body).toEqual({
      retention: { claimed: 2, deleted: 2, failed: 0 }
    });
  });
});
