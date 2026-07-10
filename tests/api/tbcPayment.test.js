import { describe, expect, test, vi } from "vitest";
import {
  PaymentProviderError,
  createPaymentAdapter
} from "../../api/_lib/adapters/tbcPayment.js";

const NOW = new Date("2026-07-10T12:00:00.000Z");

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}

function createFixture(responses) {
  const fetchImpl = vi.fn();
  for (const item of responses) fetchImpl.mockResolvedValueOnce(item);
  const logger = { error: vi.fn() };
  const payment = createPaymentAdapter({
    fetchImpl,
    apiKey: "developer-api-key",
    clientId: "merchant-client-id",
    clientSecret: "merchant-client-secret",
    baseUrl: "https://api.tbcbank.ge",
    checkoutHost: "tpay.tbcbank.ge",
    clock: { now: () => new Date(NOW) },
    logger
  });
  return { fetchImpl, logger, payment };
}

function accessToken() {
  return response({
    access_token: "provider-access-token",
    token_type: "Bearer",
    expires_in: 86400
  });
}

function createdPayment(overrides = {}) {
  return response({
    payId: "tpay-payment-1",
    status: "Created",
    currency: "EUR",
    amount: 2.99,
    preAuth: true,
    expirationMinutes: 12,
    links: [
      {
        uri: "https://api.tbcbank.ge/v1/tpay/payments/tpay-payment-1",
        method: "GET",
        rel: "self"
      },
      {
        uri: "https://tpay.tbcbank.ge/checkout/tpay-payment-1",
        method: "REDIRECT",
        rel: "approval_url"
      }
    ],
    ...overrides
  });
}

describe("TBC hosted payment adapter", () => {
  test("authenticates with form data and creates the fixed hosted preauthorization", async () => {
    const { fetchImpl, payment } = createFixture([accessToken(), createdPayment()]);

    await expect(
      payment.createHostedSession({
        merchantPaymentId: "AUR-VERIFY-1",
        returnUrl: "https://auralis.studio/application/AUR-1/complete/return-token",
        callbackUrl: "https://auralis.studio/api/payments/tbc/callback"
      })
    ).resolves.toEqual({
      providerPaymentId: "tpay-payment-1",
      approvalUrl: "https://tpay.tbcbank.ge/checkout/tpay-payment-1",
      expiresAt: new Date("2026-07-10T12:12:00.000Z")
    });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(tokenUrl).toBe("https://api.tbcbank.ge/v1/tpay/access-token");
    expect(tokenInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        accept: "application/json",
        apikey: "developer-api-key",
        "content-type": "application/x-www-form-urlencoded"
      })
    });
    expect(tokenInit.headers).not.toHaveProperty("authorization");
    expect(String(tokenInit.body)).toBe(
      "client_id=merchant-client-id&client_secret=merchant-client-secret"
    );

    const [createUrl, createInit] = fetchImpl.mock.calls[1];
    expect(createUrl).toBe("https://api.tbcbank.ge/v1/tpay/payments");
    expect(createInit.headers).toMatchObject({
      apikey: "developer-api-key",
      authorization: "Bearer provider-access-token",
      "content-type": "application/json"
    });
    expect(JSON.parse(createInit.body)).toEqual({
      amount: { currency: "EUR", total: 2.99 },
      returnurl: "https://auralis.studio/application/AUR-1/complete/return-token",
      callbackUrl: "https://auralis.studio/api/payments/tbc/callback",
      preAuth: true,
      language: "EN",
      merchantPaymentId: "AUR-VERIFY-1",
      extra: "AUR-VERIFY-1",
      saveCard: false,
      skipInfoMessage: true,
      expirationMinutes: 12,
      description: "Application verification"
    });
  });

  test("caches the access token until its safety-adjusted expiry", async () => {
    const { fetchImpl, payment } = createFixture([
      accessToken(),
      createdPayment(),
      response({
        payId: "tpay-payment-1",
        status: "WaitingConfirm",
        amount: 2.99,
        currency: "EUR",
        preAuth: true,
        extra: "AUR-VERIFY-1"
      })
    ]);

    await payment.createHostedSession({
      merchantPaymentId: "AUR-VERIFY-1",
      returnUrl: "https://auralis.studio/return",
      callbackUrl: "https://auralis.studio/callback"
    });
    await payment.getPayment("tpay-payment-1");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith("access-token"))).toHaveLength(1);
  });

  test("rejects approval links outside the configured HTTPS checkout host", async () => {
    const { payment } = createFixture([
      accessToken(),
      createdPayment({
        links: [
          {
            uri: "https://lookalike.example/checkout/tpay-payment-1",
            method: "REDIRECT",
            rel: "approval_url"
          }
        ]
      })
    ]);

    await expect(
      payment.createHostedSession({
        merchantPaymentId: "AUR-VERIFY-1",
        returnUrl: "https://auralis.studio/return",
        callbackUrl: "https://auralis.studio/callback"
      })
    ).rejects.toMatchObject({ code: "PAYMENT_APPROVAL_URL_INVALID" });
  });

  test.each([
    ["Created", "created"],
    ["Processing", "processing"],
    ["WaitingConfirm", "authorized"],
    ["Succeeded", "captured"],
    ["Failed", "failed"],
    ["Expired", "expired"],
    ["Returned", "cancelled"],
    ["PartialReturned", "partially_cancelled"]
  ])("normalizes provider status %s", async (providerStatus, state) => {
    const { payment } = createFixture([
      accessToken(),
      response({
        payId: "tpay-payment-1",
        status: providerStatus,
        amount: 2.99,
        currency: "EUR",
        preAuth: true,
        extra: "AUR-VERIFY-1"
      })
    ]);

    await expect(payment.getPayment("tpay-payment-1")).resolves.toEqual({
      providerPaymentId: "tpay-payment-1",
      state,
      amountMinor: 299,
      currency: "EUR",
      preAuth: true,
      merchantPaymentId: "AUR-VERIFY-1"
    });
  });

  test("cancels the full preauthorization exactly once without an amount body", async () => {
    const { fetchImpl, payment } = createFixture([accessToken(), response({})]);

    await expect(payment.cancelPayment("tpay-payment-1")).resolves.toEqual({
      providerPaymentId: "tpay-payment-1",
      state: "cancelled"
    });
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe(
      "https://api.tbcbank.ge/v1/tpay/payments/tpay-payment-1/cancel"
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  test("redacts provider failures and never accepts card-shaped input", async () => {
    const { logger, payment } = createFixture([
      accessToken(),
      response(
        {
          detail: "Card 4111111111111111 was rejected",
          systemCode: "tpay-payments.400.001"
        },
        { ok: false, status: 400 }
      )
    ]);

    await expect(
      payment.createHostedSession({
        merchantPaymentId: "AUR-VERIFY-1",
        returnUrl: "https://auralis.studio/return",
        callbackUrl: "https://auralis.studio/callback"
      })
    ).rejects.toBeInstanceOf(PaymentProviderError);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("4111111111111111");
    expect(logger.error).toHaveBeenCalledWith("TBC request failed", {
      operation: "create-payment",
      status: 400,
      providerCode: "tpay-payments.400.001"
    });

    await expect(
      payment.createHostedSession({
        merchantPaymentId: "AUR-VERIFY-2",
        returnUrl: "https://auralis.studio/return",
        callbackUrl: "https://auralis.studio/callback",
        cardNumber: "4111111111111111"
      })
    ).rejects.toMatchObject({ code: "CARD_DATA_NOT_ACCEPTED" });
  });
});
