import { createHash } from "node:crypto";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function deterministicUuid(value) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

export function createTurnstileAdapter({
  fetchImpl = fetch,
  secretKey,
  expectedHostname,
  expectedAction
}) {
  return {
    async verify({ token, remoteIp, idempotencyKey } = {}) {
      if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
        return { success: false };
      }

      const payload = {
        secret: secretKey,
        response: token
      };
      if (remoteIp) payload.remoteip = remoteIp;
      if (idempotencyKey) {
        payload.idempotency_key = deterministicUuid(idempotencyKey);
      }

      let response;
      try {
        response = await fetchImpl(SITEVERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch {
        throw new Error("Turnstile provider unavailable.");
      }

      if (!response.ok) throw new Error("Turnstile provider unavailable.");

      const result = await response.json();
      const hostnameMatches =
        !expectedHostname || result.hostname === expectedHostname;
      const actionMatches = !expectedAction || result.action === expectedAction;
      return {
        success: result.success === true && hostnameMatches && actionMatches
      };
    }
  };
}
