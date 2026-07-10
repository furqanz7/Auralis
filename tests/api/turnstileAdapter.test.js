import { describe, expect, test, vi } from "vitest";
import { createTurnstileAdapter } from "../../api/_lib/adapters/turnstile.js";

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return body;
    }
  };
}

describe("Turnstile adapter", () => {
  test("validates the token server-side with scoped hostname and action", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        success: true,
        hostname: "auralis.studio",
        action: "hiring_application"
      })
    );
    const adapter = createTurnstileAdapter({
      fetchImpl,
      secretKey: "turnstile-secret",
      expectedHostname: "auralis.studio",
      expectedAction: "hiring_application"
    });

    await expect(
      adapter.verify({
        token: "browser-token",
        remoteIp: "203.0.113.7",
        idempotencyKey: "submission-123"
      })
    ).resolves.toEqual({ success: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      secret: "turnstile-secret",
      response: "browser-token",
      remoteip: "203.0.113.7",
      idempotency_key: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    });
  });

  test("rejects a success response for the wrong hostname or action", async () => {
    const adapter = createTurnstileAdapter({
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          success: true,
          hostname: "attacker.example",
          action: "different_action"
        })
      ),
      secretKey: "turnstile-secret",
      expectedHostname: "auralis.studio",
      expectedAction: "hiring_application"
    });

    await expect(adapter.verify({ token: "browser-token" })).resolves.toEqual({
      success: false
    });
  });

  test("rejects missing or oversized browser tokens without a request", async () => {
    const fetchImpl = vi.fn();
    const adapter = createTurnstileAdapter({
      fetchImpl,
      secretKey: "turnstile-secret"
    });

    await expect(adapter.verify({ token: "" })).resolves.toEqual({ success: false });
    await expect(adapter.verify({ token: "x".repeat(2049) })).resolves.toEqual({
      success: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
