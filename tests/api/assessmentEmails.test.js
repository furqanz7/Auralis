import { describe, expect, test, vi } from "vitest";
import { createAssessmentService } from "../../api/_lib/assessmentService.js";
import { hashToken } from "../../api/_lib/tokens.js";

const NOW = new Date("2026-07-11T12:00:00.000Z");
const ASSESSMENT_TOKEN = "stable-assessment-token-with-enough-entropy";

function session(overrides = {}) {
  return {
    id: "session-1",
    tokenHash: hashToken(ASSESSMENT_TOKEN),
    invitationIssuedAt: new Date("2026-07-10T12:00:00.000Z"),
    invitationExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
    startedAt: null,
    submittedAt: null,
    locked: false,
    reminderSentAt: null,
    reminderAttemptCount: 1,
    application: {
      id: "application-1",
      idempotencyKey: "submission-1",
      reference: "AUR-1",
      fullName: "Nino Beridze",
      email: "nino@example.com",
      role: {
        slug: "senior-ai-product-engineer",
        title: "Senior AI Product Engineer"
      }
    },
    ...overrides
  };
}

function fixture({ claimed = [session()], emailFailure = null } = {}) {
  const attempts = [];
  let available = [...claimed];
  const repository = {
    claimDueReminders: vi.fn(async () => {
      const next = available;
      available = [];
      return next;
    }),
    recordReminderAttempt: vi.fn(async (input) => {
      attempts.push(input);
      return true;
    })
  };
  const email = {
    enqueueAssessmentReminder: vi.fn(async () => {
      if (emailFailure) throw emailFailure;
      return { providerMessageId: "email-1" };
    })
  };
  const service = createAssessmentService({
    repository,
    email,
    clock: { now: () => new Date(NOW) },
    verificationTokenFactory: () => "verification-token",
    reminderTokenFactory: () => ASSESSMENT_TOKEN
  });
  return { attempts, email, repository, service };
}

describe("assessment reminder dispatch", () => {
  test("sends a claimed reminder once and records the provider message", async () => {
    const { attempts, email, service } = fixture();

    await expect(service.sendDueReminders({ limit: 25 })).resolves.toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
      skipped: 0
    });
    await expect(service.sendDueReminders({ limit: 25 })).resolves.toMatchObject({
      claimed: 0,
      sent: 0
    });

    expect(email.enqueueAssessmentReminder).toHaveBeenCalledWith({
      session: expect.objectContaining({ id: "session-1" }),
      assessmentToken: ASSESSMENT_TOKEN
    });
    expect(attempts[0]).toMatchObject({
      sessionId: "session-1",
      attemptNumber: 1,
      status: "sent",
      providerMessageId: "email-1"
    });
  });

  test("defensively skips started, expired, submitted, or already-reminded sessions", async () => {
    const { email, repository, service } = fixture({
      claimed: [
        session({ id: "started", startedAt: new Date(NOW) }),
        session({ id: "expired", invitationExpiresAt: new Date(NOW) }),
        session({ id: "submitted", submittedAt: new Date(NOW), locked: true }),
        session({ id: "reminded", reminderSentAt: new Date(NOW) })
      ]
    });

    await expect(service.sendDueReminders()).resolves.toMatchObject({
      claimed: 4,
      sent: 0,
      skipped: 4
    });
    expect(email.enqueueAssessmentReminder).not.toHaveBeenCalled();
    expect(repository.recordReminderAttempt).not.toHaveBeenCalled();
  });

  test("persists a bounded retry after provider failure", async () => {
    const { attempts, service } = fixture({
      emailFailure: new Error("provider unavailable")
    });

    await expect(service.sendDueReminders()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      failed: 1
    });
    expect(attempts[0]).toEqual({
      sessionId: "session-1",
      attemptNumber: 1,
      status: "failed",
      providerMessageId: null,
      errorCode: "EMAIL_PROVIDER_REJECTED",
      attemptedAt: NOW,
      nextAttemptAt: new Date("2026-07-11T12:15:00.000Z")
    });
  });

  test("never sends a regenerated link whose hash differs from the stored token", async () => {
    const { email, service } = fixture({
      claimed: [session({ tokenHash: hashToken("another-token") })]
    });

    await expect(service.sendDueReminders()).resolves.toMatchObject({
      sent: 0,
      failed: 1
    });
    expect(email.enqueueAssessmentReminder).not.toHaveBeenCalled();
  });
});
