import { describe, expect, test, vi } from "vitest";
import { VerificationDomainError } from "../../api/_lib/verificationService.js";
import { createVerificationSessionHandler } from "../../api/verifications/[token]/session.js";
import { createVerificationStatusHandler } from "../../api/verifications/[token]/status.js";
import { createTbcCallbackHandler } from "../../api/payments/tbc/callback.js";
import { createVerificationRetryHandler } from "../../api/cron/verification-retries.js";

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

function request(overrides = {}) {
  return {
    method: "POST",
    query: { token: "private-verification-token" },
    headers: {
      "content-type": "application/json",
      "idempotency-key": "verification-session-1"
    },
    body: {},
    ...overrides
  };
}

describe("verification handlers", () => {
  test("creates a hosted session using only the server site URL", async () => {
    const service = {
      createSession: vi.fn(async () => ({
        approvalUrl: "https://tpay.tbcbank.ge/checkout/tpay-payment-1"
      }))
    };
    const result = response();

    await createVerificationSessionHandler({
      service,
      siteUrl: "https://auralis.studio"
    })(request(), result);

    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(service.createSession).toHaveBeenCalledWith({
      verificationToken: "private-verification-token",
      returnBaseUrl: "https://auralis.studio",
      idempotencyKey: "verification-session-1"
    });
  });

  test("requires a stable idempotency key and rejects client payment fields", async () => {
    const service = { createSession: vi.fn() };
    const handler = createVerificationSessionHandler({
      service,
      siteUrl: "https://auralis.studio"
    });
    const missingKey = response();
    await handler(request({ headers: { "content-type": "application/json" } }), missingKey);
    expect(missingKey.statusCode).toBe(400);

    const injected = response();
    await handler(
      request({ body: { amount: 0, status: "completed", cardNumber: "4111" } }),
      injected
    );
    expect(injected.statusCode).toBe(422);
    expect(service.createSession).not.toHaveBeenCalled();
  });

  test("returns browser-safe status without score or provider identifiers", async () => {
    const service = {
      getStatus: vi.fn(async () => ({
        state: "processing",
        applicationReference: "AUR-1",
        candidateEmail: "nino@example.com"
      }))
    };
    const result = response();

    await createVerificationStatusHandler(service)(
      request({ method: "GET", headers: {} }),
      result
    );

    expect(result.statusCode).toBe(200);
    expect(service.getStatus).toHaveBeenCalledWith({
      verificationToken: "private-verification-token"
    });
    expect(JSON.stringify(result.body)).not.toMatch(/score|providerPaymentId/i);
  });

  test("accepts only TBC PaymentId and delegates authoritative lookup", async () => {
    const service = {
      handleCallback: vi.fn(async () => ({ acknowledged: true }))
    };
    const handler = createTbcCallbackHandler(service);
    const result = response();
    await handler(
      request({
        query: {},
        headers: { "content-type": "application/json" },
        body: { PaymentId: "tpay-payment-1" }
      }),
      result
    );
    expect(result.statusCode).toBe(200);
    expect(service.handleCallback).toHaveBeenCalledWith({
      providerPaymentId: "tpay-payment-1"
    });

    const injected = response();
    await handler(
      request({
        query: {},
        headers: { "content-type": "application/json" },
        body: { PaymentId: "tpay-payment-1", status: "Succeeded", amount: 2.99 }
      }),
      injected
    );
    expect(injected.statusCode).toBe(422);
  });

  test("maps domain failures and acknowledges unknown duplicate callbacks", async () => {
    const failed = response();
    await createVerificationStatusHandler({
      getStatus: vi.fn(async () => {
        throw new VerificationDomainError("VERIFICATION_INVALID", 404);
      })
    })(request({ method: "GET", headers: {} }), failed);
    expect(failed.statusCode).toBe(404);

    const duplicate = response();
    await createTbcCallbackHandler({
      handleCallback: vi.fn(async () => ({ acknowledged: true }))
    })(
      request({
        query: {},
        headers: { "content-type": "application/json" },
        body: { PaymentId: "unknown-provider-payment" }
      }),
      duplicate
    );
    expect(duplicate.statusCode).toBe(200);
  });

  test("authenticates retry cron and processes a bounded batch", async () => {
    const service = {
      retryDueCancellations: vi.fn(async () => ({ claimed: 3, completed: 2, failed: 1 }))
    };
    const handler = createVerificationRetryHandler({
      service,
      cronSecret: "cron-secret-with-at-least-32-characters"
    });
    const unauthorized = response();
    await handler({ method: "GET", headers: {} }, unauthorized);
    expect(unauthorized.statusCode).toBe(401);

    const authorized = response();
    await handler(
      {
        method: "GET",
        headers: {
          authorization: "Bearer cron-secret-with-at-least-32-characters"
        }
      },
      authorized
    );
    expect(authorized.statusCode).toBe(200);
    expect(service.retryDueCancellations).toHaveBeenCalledWith({ limit: 20 });
  });
});
