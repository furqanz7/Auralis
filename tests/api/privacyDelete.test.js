import { describe, expect, test, vi } from "vitest";
import {
  PrivacyDomainError,
  createHiringPrivacyService
} from "../../api/_lib/privacyService.js";
import { createPrivacyDeleteRequestHandler } from "../../api/privacy/delete-request.js";
import { hashToken } from "../../api/_lib/tokens.js";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const TOKEN = "privacy-token-with-enough-entropy";

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

function fixture({ applicationExists = true } = {}) {
  const events = [];
  const application = {
    id: "application-1",
    reference: "AUR-1",
    fullName: "Nino Beridze",
    email: "nino@example.com",
    cvObjectKey: "campaign/upload/cv.pdf",
    deletionAttemptCount: 1,
    role: { title: "Senior AI Product Engineer" }
  };
  let request = { tokenHash: hashToken(TOKEN) };
  const repository = {
    createDeletionRequest: vi.fn(async (input) => {
      request = input;
      return applicationExists ? application : null;
    }),
    claimDeletionByTokenHash: vi.fn(async (tokenHash) =>
      applicationExists && request?.tokenHash === tokenHash ? application : null
    ),
    finalizeApplicationDeletion: vi.fn(async ({ applicationId, reason }) => {
      events.push(`database:${applicationId}:${reason}`);
      return true;
    }),
    recordDeletionFailure: vi.fn(async () => true),
    claimExpiredApplications: vi.fn(async () => [])
  };
  const storage = {
    deleteObject: vi.fn(async (objectKey) => {
      events.push(`storage:${objectKey}`);
      return { deleted: true };
    })
  };
  const email = {};
  const service = createHiringPrivacyService({
    repository,
    storage,
    email,
    clock: { now: () => new Date(NOW) },
    tokenFactory: () => TOKEN
  });
  return { application, email, events, repository, service, storage };
}

describe("candidate deletion", () => {
  test("returns the same generic response without sending an external email", async () => {
    const existing = fixture();
    const missing = fixture({ applicationExists: false });

    await expect(
      existing.service.requestDeletion({ email: " NINO@EXAMPLE.COM " })
    ).resolves.toEqual({ accepted: true });
    await expect(
      missing.service.requestDeletion({ email: "nobody@example.com" })
    ).resolves.toEqual({ accepted: true });

    expect(existing.repository.createDeletionRequest).not.toHaveBeenCalled();
    expect(missing.repository.createDeletionRequest).not.toHaveBeenCalled();
    expect(existing.repository.finalizeApplicationDeletion).not.toHaveBeenCalled();
  });

  test("deletes storage before PII only after token confirmation", async () => {
    const { events, service } = fixture();
    await service.requestDeletion({ email: "nino@example.com" });

    await expect(service.confirmDeletion({ deletionToken: TOKEN })).resolves.toEqual({
      deleted: true
    });
    expect(events).toEqual([
      "storage:campaign/upload/cv.pdf",
      "database:application-1:candidate_request"
    ]);
  });

  test("fails closed for an invalid confirmation token", async () => {
    const { service } = fixture();

    await expect(
      service.confirmDeletion({ deletionToken: "invalid-token" })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "PrivacyDomainError",
        code: "DELETION_LINK_INVALID",
        status: 404
      })
    );
    expect(PrivacyDomainError).toBeTypeOf("function");
  });

  test("keeps PII and schedules a retry when confirmed storage deletion fails", async () => {
    const { repository, service, storage } = fixture();
    storage.deleteObject.mockRejectedValueOnce(new Error("storage unavailable"));
    await service.requestDeletion({ email: "nino@example.com" });

    await expect(service.confirmDeletion({ deletionToken: TOKEN })).rejects.toEqual(
      expect.objectContaining({
        code: "DELETION_RETRY_PENDING",
        status: 503
      })
    );
    expect(repository.finalizeApplicationDeletion).not.toHaveBeenCalled();
    expect(repository.recordDeletionFailure).toHaveBeenCalledWith({
      applicationId: "application-1",
      attemptNumber: 1,
      errorCategory: "STORAGE_DELETE_FAILED",
      attemptedAt: NOW,
      nextAttemptAt: new Date("2026-07-10T13:00:00.000Z")
    });
  });

  test("schedules a retry when PII finalization fails after storage deletion", async () => {
    const { repository, service, storage } = fixture();
    repository.finalizeApplicationDeletion.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    await service.requestDeletion({ email: "nino@example.com" });

    await expect(service.confirmDeletion({ deletionToken: TOKEN })).rejects.toEqual(
      expect.objectContaining({
        code: "DELETION_RETRY_PENDING",
        status: 503
      })
    );
    expect(storage.deleteObject).toHaveBeenCalledWith("campaign/upload/cv.pdf");
    expect(repository.recordDeletionFailure).toHaveBeenCalledWith({
      applicationId: "application-1",
      attemptNumber: 1,
      errorCategory: "DATABASE_DELETE_FAILED",
      attemptedAt: NOW,
      nextAttemptAt: new Date("2026-07-10T13:00:00.000Z")
    });
  });

  test("exposes a no-store generic deletion-request endpoint", async () => {
    const { service } = fixture({ applicationExists: false });
    const result = response();

    await createPrivacyDeleteRequestHandler(service)(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { email: "nobody@example.com" }
      },
      result
    );

    expect(result.statusCode).toBe(202);
    expect(result.body).toEqual({ accepted: true });
    expect(result.headers["cache-control"]).toBe("no-store");
  });
});
