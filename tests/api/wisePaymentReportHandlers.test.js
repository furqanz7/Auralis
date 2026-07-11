import { describe, expect, test, vi } from "vitest";
import { WisePaymentReportDomainError } from "../../api/_lib/wisePaymentReportService.js";
import { createWisePaymentReportHandler } from "../../api/verifications/[token]/status.js";

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
    headers: { "content-type": "application/json" },
    body: { payerName: "Nino Beridze" },
    ...overrides
  };
}

describe("Wise payment report handler", () => {
  test("reports a payment through the private verification route", async () => {
    const service = {
      reportPayment: vi.fn(async () => ({
        state: "reported",
        reportedAt: "2026-07-11T10:00:00.000Z"
      }))
    };
    const result = response();

    await createWisePaymentReportHandler(service)(request(), result);

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
    });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(service.reportPayment).toHaveBeenCalledWith({
      verificationToken: "private-verification-token",
      payerName: "Nino Beridze"
    });
  });

  test("accepts an empty body for a pending notification retry", async () => {
    const service = {
      reportPayment: vi.fn(async () => ({
        state: "notification_pending",
        reportedAt: "2026-07-11T10:00:00.000Z"
      }))
    };
    const result = response();

    await createWisePaymentReportHandler(service)(
      request({ body: {} }),
      result
    );

    expect(result.statusCode).toBe(200);
    expect(service.reportPayment).toHaveBeenCalledWith({
      verificationToken: "private-verification-token",
      payerName: undefined
    });
  });

  test("rejects methods other than POST", async () => {
    const service = { reportPayment: vi.fn() };
    const result = response();

    await createWisePaymentReportHandler(service)(
      request({ method: "GET", headers: {}, body: undefined }),
      result
    );

    expect(result.statusCode).toBe(405);
    expect(result.headers.allow).toBe("POST");
    expect(service.reportPayment).not.toHaveBeenCalled();
  });

  test.each(["amount", "currency", "applicationId", "status", "email"])(
    "rejects the client-owned %s field",
    async (field) => {
      const service = { reportPayment: vi.fn() };
      const result = response();

      await createWisePaymentReportHandler(service)(
        request({ body: { payerName: "Nino Beridze", [field]: "injected" } }),
        result
      );

      expect(result.statusCode).toBe(422);
      expect(result.body).toEqual({
        error: { code: "PAYMENT_REPORT_BODY_INVALID" }
      });
      expect(service.reportPayment).not.toHaveBeenCalled();
    }
  );

  test.each([null, 299, { value: "Nino Beridze" }])(
    "rejects the non-string payer name %j",
    async (payerName) => {
      const service = { reportPayment: vi.fn() };
      const result = response();

      await createWisePaymentReportHandler(service)(
        request({ body: { payerName } }),
        result
      );

      expect(result.statusCode).toBe(422);
      expect(service.reportPayment).not.toHaveBeenCalled();
    }
  );

  test("preserves domain error status codes", async () => {
    const service = {
      reportPayment: vi.fn(async () => {
        throw new WisePaymentReportDomainError(
          "PAYMENT_REPORT_UNAVAILABLE",
          409
        );
      })
    };
    const result = response();

    await createWisePaymentReportHandler(service)(request(), result);

    expect(result.statusCode).toBe(409);
    expect(result.body).toEqual({
      error: { code: "PAYMENT_REPORT_UNAVAILABLE" }
    });
  });
});
