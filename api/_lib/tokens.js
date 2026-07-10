import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

export function createOpaqueToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new TypeError("Opaque tokens require at least 16 bytes.");
  }

  return randomBytes(bytes).toString("base64url");
}

export function createAssessmentTokenFactory(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new TypeError("Assessment tokens require a secret of at least 32 characters.");
  }

  return ({ idempotencyKey }) => {
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
      throw new TypeError("Assessment tokens require an idempotency key.");
    }
    return createHmac("sha256", secret)
      .update(`assessment-invite:v1:${idempotencyKey}`)
      .digest("base64url");
  };
}

export function createVerificationReturnTokenFactory(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new TypeError(
      "Verification return tokens require a secret of at least 32 characters."
    );
  }

  return ({ applicationId, idempotencyKey }) => {
    if (
      typeof applicationId !== "string" ||
      !applicationId ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8
    ) {
      throw new TypeError("Verification return tokens require stable identifiers.");
    }
    return createHmac("sha256", secret)
      .update(`verification-return:v1:${applicationId}:${idempotencyKey}`)
      .digest("base64url");
  };
}

export function hashToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Token must be a non-empty string.");
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqualHash(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}
