import { describe, expect, test, vi } from "vitest";
import { createSupabasePrivacyRepository } from "../../api/_lib/adapters/supabase.js";

const row = {
  id: "application-1",
  reference: "AUR-1",
  full_name: "Nino Beridze",
  email: "nino@example.com",
  cv_object_key: "campaign/upload/cv.pdf",
  deletion_due_at: "2027-01-06T12:00:00.000Z",
  deletion_attempt_count: 2,
  role: {
    slug: "senior-ai-product-engineer",
    title: "Senior AI Product Engineer"
  }
};

function fixture(overrides = {}) {
  const defaults = {
    claim_hiring_applications_for_deletion: [row],
    create_hiring_deletion_request: row,
    claim_hiring_deletion_by_token: row,
    finalize_hiring_application_deletion: true,
    record_hiring_application_deletion_failure: true
  };
  const rpc = vi.fn(async (name) => ({
    data: name in overrides ? overrides[name] : defaults[name],
    error: null
  }));
  return {
    repository: createSupabasePrivacyRepository({ client: { rpc } }),
    rpc
  };
}

describe("Supabase privacy repository", () => {
  test("atomically claims due applications and maps deletion state", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2027-01-06T12:00:00.000Z");

    await expect(
      repository.claimExpiredApplications({ now, limit: 25 })
    ).resolves.toEqual([
      {
        id: "application-1",
        reference: "AUR-1",
        fullName: "Nino Beridze",
        email: "nino@example.com",
        cvObjectKey: "campaign/upload/cv.pdf",
        deletionDueAt: new Date("2027-01-06T12:00:00.000Z"),
        deletionAttemptCount: 2,
        role: {
          slug: "senior-ai-product-engineer",
          title: "Senior AI Product Engineer"
        }
      }
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "claim_hiring_applications_for_deletion",
      { p_now: now.toISOString(), p_limit: 25 }
    );
  });

  test("creates and claims deletion tokens through service-role RPCs", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-10T12:00:00.000Z");
    const expiresAt = new Date("2026-07-11T12:00:00.000Z");

    await expect(
      repository.createDeletionRequest({
        email: "nino@example.com",
        tokenHash: "a".repeat(64),
        expiresAt,
        now
      })
    ).resolves.toMatchObject({ id: "application-1" });
    await expect(
      repository.claimDeletionByTokenHash("a".repeat(64), now)
    ).resolves.toMatchObject({ cvObjectKey: "campaign/upload/cv.pdf" });

    expect(rpc).toHaveBeenCalledWith("create_hiring_deletion_request", {
      p_email: "nino@example.com",
      p_token_hash: "a".repeat(64),
      p_expires_at: expiresAt.toISOString(),
      p_now: now.toISOString()
    });
    expect(rpc).toHaveBeenCalledWith("claim_hiring_deletion_by_token", {
      p_token_hash: "a".repeat(64),
      p_now: now.toISOString()
    });
  });

  test("finalizes deletion and persists retry metadata", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-10T12:00:00.000Z");
    const nextAttemptAt = new Date("2026-07-10T13:00:00.000Z");

    await expect(
      repository.finalizeApplicationDeletion({
        applicationId: "application-1",
        reason: "retention",
        deletedAt: now
      })
    ).resolves.toBe(true);
    await expect(
      repository.recordDeletionFailure({
        applicationId: "application-1",
        attemptNumber: 2,
        errorCategory: "STORAGE_DELETE_FAILED",
        attemptedAt: now,
        nextAttemptAt
      })
    ).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith(
      "record_hiring_application_deletion_failure",
      {
        p_application_id: "application-1",
        p_attempt_number: 2,
        p_error_category: "STORAGE_DELETE_FAILED",
        p_attempted_at: now.toISOString(),
        p_next_attempt_at: nextAttemptAt.toISOString()
      }
    );
  });
});
