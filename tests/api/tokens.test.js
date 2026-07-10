import { describe, expect, test } from "vitest";
import {
  createAssessmentTokenFactory,
  createOpaqueToken,
  createVerificationReturnTokenFactory,
  hashToken,
  safeEqualHash
} from "../../api/_lib/tokens.js";

describe("hiring access tokens", () => {
  test("creates URL-safe opaque one-way tokens", () => {
    const token = createOpaqueToken(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(token)).not.toContain(token);
  });

  test("compares token hashes in constant-time compatible buffers", () => {
    const hash = hashToken("private-token");

    expect(safeEqualHash(hash, hashToken("private-token"))).toBe(true);
    expect(safeEqualHash(hash, hashToken("different-token"))).toBe(false);
    expect(safeEqualHash(hash, "short")).toBe(false);
  });

  test("rejects unsafe token byte lengths", () => {
    expect(() => createOpaqueToken(15)).toThrow(/at least 16 bytes/i);
  });

  test("derives a stable private assessment token from an idempotency key", () => {
    const createToken = createAssessmentTokenFactory(
      "assessment-secret-with-at-least-32-characters"
    );

    expect(createToken({ idempotencyKey: "submission-1" })).toBe(
      createToken({ idempotencyKey: "submission-1" })
    );
    expect(createToken({ idempotencyKey: "submission-1" })).not.toBe(
      createToken({ idempotencyKey: "submission-2" })
    );
    expect(createToken({ idempotencyKey: "submission-1" })).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    );
  });

  test("derives a stable verification return token without exposing the secret", () => {
    const createToken = createVerificationReturnTokenFactory(
      "assessment-secret-with-at-least-32-characters"
    );

    const token = createToken({
      applicationId: "application-1",
      idempotencyKey: "verification-session-1"
    });
    expect(token).toBe(
      createToken({
        applicationId: "application-1",
        idempotencyKey: "verification-session-1"
      })
    );
    expect(token).not.toContain("application-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
