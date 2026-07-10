import { describe, expect, test, vi } from "vitest";
import { createHiringPrivacyService } from "../../api/_lib/privacyService.js";

const NOW = new Date("2027-01-06T12:00:00.000Z");

function application(overrides = {}) {
  return {
    id: "application-1",
    reference: "AUR-1",
    email: "nino@example.com",
    fullName: "Nino Beridze",
    cvObjectKey: "campaign/upload/cv.pdf",
    deletionDueAt: new Date(NOW),
    deletionAttemptCount: 1,
    role: { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" },
    ...overrides
  };
}

function fixture({ applications = [application()], storageFailure = null } = {}) {
  const events = [];
  const rows = [...applications];
  const repository = {
    claimExpiredApplications: vi.fn(async ({ now, limit }) =>
      rows
        .filter((candidate) => candidate.deletionDueAt <= now && !candidate.deleted)
        .slice(0, limit)
    ),
    finalizeApplicationDeletion: vi.fn(async ({ applicationId, reason }) => {
      events.push(`database:${applicationId}:${reason}`);
      const row = rows.find((candidate) => candidate.id === applicationId);
      if (row) row.deleted = true;
      return true;
    }),
    recordDeletionFailure: vi.fn(async (input) => {
      events.push(`retry:${input.applicationId}:${input.errorCategory}`);
      return true;
    })
  };
  const storage = {
    deleteObject: vi.fn(async (objectKey) => {
      events.push(`storage:${objectKey}`);
      if (storageFailure) throw storageFailure;
      return { deleted: true };
    })
  };
  const service = createHiringPrivacyService({
    repository,
    storage,
    email: {},
    clock: { now: () => new Date(NOW) },
    tokenFactory: () => "privacy-token-with-enough-entropy"
  });
  return { events, repository, service, storage };
}

describe("hiring retention", () => {
  test("purges at the exact 180-day due boundary with storage first", async () => {
    const { events, service } = fixture();

    await expect(service.purgeExpiredApplications({ limit: 25 })).resolves.toEqual({
      claimed: 1,
      deleted: 1,
      failed: 0
    });
    expect(events).toEqual([
      "storage:campaign/upload/cv.pdf",
      "database:application-1:retention"
    ]);
  });

  test("does not purge before the due boundary", async () => {
    const { repository, service, storage } = fixture({
      applications: [
        application({ deletionDueAt: new Date("2027-01-06T12:00:00.001Z") })
      ]
    });

    await expect(service.purgeExpiredApplications()).resolves.toMatchObject({
      claimed: 0,
      deleted: 0
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repository.finalizeApplicationDeletion).not.toHaveBeenCalled();
  });

  test("persists a retry and keeps PII when CV deletion fails", async () => {
    const { repository, service } = fixture({
      storageFailure: new Error("storage unavailable")
    });

    await expect(service.purgeExpiredApplications()).resolves.toMatchObject({
      claimed: 1,
      deleted: 0,
      failed: 1
    });
    expect(repository.finalizeApplicationDeletion).not.toHaveBeenCalled();
    expect(repository.recordDeletionFailure).toHaveBeenCalledWith({
      applicationId: "application-1",
      attemptNumber: 1,
      errorCategory: "STORAGE_DELETE_FAILED",
      attemptedAt: NOW,
      nextAttemptAt: new Date("2027-01-06T13:00:00.000Z")
    });
  });

  test("is idempotent after application data has been purged", async () => {
    const { service, storage } = fixture();

    await service.purgeExpiredApplications();
    await expect(service.purgeExpiredApplications()).resolves.toMatchObject({
      claimed: 0,
      deleted: 0
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });
});
