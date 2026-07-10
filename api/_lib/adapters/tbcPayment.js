import { VERIFICATION_PAYMENT } from "./contracts.js";

const CREATE_INPUT_KEYS = new Set([
  "merchantPaymentId",
  "returnUrl",
  "callbackUrl"
]);

const STATUS_MAP = Object.freeze({
  Created: "created",
  Processing: "processing",
  CancelPaymentProcessing: "processing",
  PaymentCompletionProcessing: "processing",
  WaitingConfirm: "authorized",
  Succeeded: "captured",
  Failed: "failed",
  Expired: "expired",
  Returned: "cancelled",
  PartialReturned: "partially_cancelled"
});

export class PaymentProviderError extends Error {
  constructor(code, { status = 502, retriable = false, providerCode = null } = {}) {
    super(code);
    this.name = "PaymentProviderError";
    this.code = code;
    this.status = status;
    this.retriable = retriable;
    this.providerCode = providerCode;
  }
}

function providerId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200) {
    throw new PaymentProviderError("PAYMENT_PROVIDER_ID_INVALID");
  }
  return value;
}

function secureUrl(value, code) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new PaymentProviderError(code, { status: 502 });
  }
}

function assertHostedInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PaymentProviderError("PAYMENT_SESSION_INVALID", { status: 422 });
  }
  if (Object.keys(input).some((key) => !CREATE_INPUT_KEYS.has(key))) {
    throw new PaymentProviderError("CARD_DATA_NOT_ACCEPTED", { status: 422 });
  }
  if (
    typeof input.merchantPaymentId !== "string" ||
    input.merchantPaymentId.length < 1 ||
    input.merchantPaymentId.length > 25 ||
    !/^[\x20-\x7E]+$/.test(input.merchantPaymentId)
  ) {
    throw new PaymentProviderError("PAYMENT_MERCHANT_REFERENCE_INVALID", {
      status: 422
    });
  }
  secureUrl(input.returnUrl, "PAYMENT_RETURN_URL_INVALID");
  secureUrl(input.callbackUrl, "PAYMENT_CALLBACK_URL_INVALID");
}

function normalizedProviderCode(body) {
  const value = body?.systemCode ?? body?.resultCode;
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
    ? value
    : null;
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function createPaymentAdapter({
  fetchImpl,
  apiKey,
  clientId,
  clientSecret,
  baseUrl,
  checkoutHost,
  clock = { now: () => new Date() },
  logger = { error() {} }
}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required.");
  const apiBase = secureUrl(baseUrl, "PAYMENT_BASE_URL_INVALID");
  const normalizedBase = apiBase.toString().replace(/\/$/, "");
  const normalizedCheckoutHost = String(checkoutHost ?? "").toLowerCase();
  if (!normalizedCheckoutHost) throw new TypeError("checkoutHost is required.");

  let cachedAccessToken = null;
  let accessTokenExpiresAt = 0;

  async function providerFetch(url, init, operation) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new PaymentProviderError("PAYMENT_PROVIDER_UNAVAILABLE", {
        status: 503,
        retriable: true
      });
    }
    const body = await readResponseBody(response);
    if (!response.ok) {
      const providerCode = normalizedProviderCode(body);
      logger.error("TBC request failed", {
        operation,
        status: response.status,
        providerCode
      });
      throw new PaymentProviderError("PAYMENT_PROVIDER_ERROR", {
        status: 502,
        retriable: response.status === 429 || response.status >= 500,
        providerCode
      });
    }
    return body;
  }

  async function getAccessToken() {
    const now = clock.now().getTime();
    if (cachedAccessToken && accessTokenExpiresAt > now) return cachedAccessToken;

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret
    });
    const body = await providerFetch(
      `${normalizedBase}/v1/tpay/access-token`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          apikey: apiKey,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: form
      },
      "access-token"
    );
    if (
      typeof body.access_token !== "string" ||
      !Number.isFinite(Number(body.expires_in))
    ) {
      throw new PaymentProviderError("PAYMENT_ACCESS_TOKEN_INVALID");
    }

    cachedAccessToken = body.access_token;
    accessTokenExpiresAt =
      now + Math.max(0, Number(body.expires_in) * 1000 - 60 * 1000);
    return cachedAccessToken;
  }

  async function request(path, { method = "GET", body, operation }) {
    const accessToken = await getAccessToken();
    const headers = {
      accept: "application/json",
      apikey: apiKey,
      authorization: `Bearer ${accessToken}`
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    return providerFetch(
      `${normalizedBase}${path}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      },
      operation
    );
  }

  return {
    async createHostedSession(input) {
      assertHostedInput(input);
      const body = await request("/v1/tpay/payments", {
        method: "POST",
        operation: "create-payment",
        body: {
          amount: {
            currency: VERIFICATION_PAYMENT.currency,
            total: VERIFICATION_PAYMENT.amountMinor / 100
          },
          returnurl: input.returnUrl,
          callbackUrl: input.callbackUrl,
          preAuth: VERIFICATION_PAYMENT.preAuth,
          language: "EN",
          merchantPaymentId: input.merchantPaymentId,
          extra: input.merchantPaymentId,
          saveCard: VERIFICATION_PAYMENT.saveCard,
          skipInfoMessage: true,
          expirationMinutes: 12,
          description: "Application verification"
        }
      });

      const approval = body.links?.find((link) => link?.rel === "approval_url");
      const approvalUrl = secureUrl(
        approval?.uri,
        "PAYMENT_APPROVAL_URL_INVALID"
      );
      if (approvalUrl.hostname.toLowerCase() !== normalizedCheckoutHost) {
        throw new PaymentProviderError("PAYMENT_APPROVAL_URL_INVALID");
      }
      const expirationMinutes = Number.isFinite(Number(body.expirationMinutes))
        ? Number(body.expirationMinutes)
        : 12;
      return {
        providerPaymentId: providerId(body.payId),
        approvalUrl: approvalUrl.toString(),
        expiresAt: new Date(
          clock.now().getTime() + Math.max(1, expirationMinutes) * 60 * 1000
        )
      };
    },

    async getPayment(paymentId) {
      const id = providerId(paymentId);
      const body = await request(`/v1/tpay/payments/${encodeURIComponent(id)}`, {
        operation: "get-payment"
      });
      return {
        providerPaymentId: providerId(body.payId),
        state: STATUS_MAP[body.status] ?? "unknown",
        amountMinor: Math.round(Number(body.amount) * 100),
        currency: body.currency,
        preAuth: body.preAuth === true || body.preAuth === "true",
        merchantPaymentId: body.merchantPaymentId ?? body.extra ?? null
      };
    },

    async cancelPayment(paymentId) {
      const id = providerId(paymentId);
      await request(
        `/v1/tpay/payments/${encodeURIComponent(id)}/cancel`,
        { method: "POST", operation: "cancel-payment" }
      );
      return { providerPaymentId: id, state: "cancelled" };
    }
  };
}
