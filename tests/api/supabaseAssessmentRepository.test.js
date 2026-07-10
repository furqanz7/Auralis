import { describe, expect, test, vi } from "vitest";
import { createSupabaseAssessmentRepository } from "../../api/_lib/adapters/supabase.js";

const sessionRow = {
  id: "session-id",
  application_id: "application-id",
  token_hash: "a".repeat(64),
  assessment_version: 1,
  question_snapshot: [
    {
      id: "ai-01",
      dimension: "craft",
      prompt: "A sufficiently long question prompt for the repository test.",
      options: [{ id: "a", label: "Correct" }],
      correctOptionId: "a"
    }
  ],
  invitation_expires_at: "2026-07-13T12:00:00.000Z",
  started_at: "2026-07-10T12:00:00.000Z",
  deadline_at: "2026-07-10T12:20:00.000Z",
  submitted_at: null,
  raw_score: null,
  dimension_scores: null,
  response_version: 1,
  locked: false,
  completion_reason: null,
  application_reference: "AUR-1",
  full_name: "Nino Beridze",
  email: "nino@example.com",
  cv_object_key: "campaign/upload/cv.pdf",
  role_id: "role-id",
  role_slug: "senior-ai-product-engineer",
  role_title: "Senior AI Product Engineer",
  responses: [{ questionId: "ai-01", optionId: "a" }]
};

const reminderRow = {
  id: "session-id",
  token_hash: "a".repeat(64),
  invitation_issued_at: "2026-07-10T12:00:00.000Z",
  invitation_expires_at: "2026-07-13T12:00:00.000Z",
  started_at: null,
  submitted_at: null,
  locked: false,
  reminder_sent_at: null,
  reminder_attempt_count: 1,
  application_id: "application-id",
  application_reference: "AUR-1",
  application_idempotency_key: "submission-1",
  full_name: "Nino Beridze",
  email: "nino@example.com",
  role_id: "role-id",
  role_slug: "senior-ai-product-engineer",
  role_title: "Senior AI Product Engineer"
};

function fixture(overrides = {}) {
  const rpc = vi.fn(async (name) => {
    const defaults = {
      get_hiring_assessment_session: [sessionRow],
      issue_hiring_assessment_invitation: true,
      start_hiring_assessment: true,
      save_hiring_assessment_answer: [
        { conflict: false, version: 2, saved_at: "2026-07-10T12:02:00.000Z" }
      ],
      complete_hiring_assessment: true,
      claim_hiring_assessment_reminders: [reminderRow],
      record_hiring_assessment_reminder: true
    };
    return { data: overrides[name] ?? defaults[name], error: null };
  });
  return {
    repository: createSupabaseAssessmentRepository({ client: { rpc } }),
    rpc
  };
}

describe("Supabase assessment repository", () => {
  test("normalizes the complete assessment session", async () => {
    const { repository } = fixture();

    await expect(
      repository.findSessionByTokenHash("a".repeat(64))
    ).resolves.toMatchObject({
      id: "session-id",
      deadlineAt: new Date("2026-07-10T12:20:00.000Z"),
      responseVersion: 1,
      application: {
        id: "application-id",
        reference: "AUR-1",
        role: { slug: "senior-ai-product-engineer" }
      },
      responses: [{ questionId: "ai-01", optionId: "a" }]
    });
  });

  test("issues an invitation and returns its session", async () => {
    const { repository, rpc } = fixture();

    await repository.createInvitation({
      application: {
        id: "application-id",
        role: { slug: "senior-ai-product-engineer" }
      },
      tokenHash: "a".repeat(64),
      assessmentVersion: 1,
      expiresAt: new Date("2026-07-13T12:00:00.000Z"),
      now: new Date("2026-07-10T12:00:00.000Z")
    });

    expect(rpc).toHaveBeenCalledWith(
      "issue_hiring_assessment_invitation",
      expect.objectContaining({ p_token_hash: "a".repeat(64) })
    );
  });

  test("starts idempotently and reloads the authoritative session", async () => {
    const { repository, rpc } = fixture();

    const result = await repository.startSession({
      sessionId: "session-id",
      questionSnapshot: sessionRow.question_snapshot,
      startedAt: new Date("2026-07-10T12:00:00.000Z"),
      deadlineAt: new Date("2026-07-10T12:20:00.000Z")
    });

    expect(result.id).toBe("session-id");
    expect(rpc).toHaveBeenCalledWith(
      "start_hiring_assessment",
      expect.objectContaining({ p_session_id: "session-id" })
    );
  });

  test("maps optimistic answer saves and completion status", async () => {
    const { repository, rpc } = fixture();

    await expect(
      repository.saveAnswer({
        sessionId: "session-id",
        questionId: "ai-01",
        optionId: "a",
        expectedVersion: 1,
        savedAt: new Date("2026-07-10T12:02:00.000Z")
      })
    ).resolves.toEqual({
      conflict: false,
      version: 2,
      savedAt: new Date("2026-07-10T12:02:00.000Z")
    });

    await expect(
      repository.completeSession({
        sessionId: "session-id",
        result: {
          rawScore: 1,
          dimensionScores: { craft: 1, systems: 0, judgment: 0, delivery: 0 }
        },
        verificationTokenHash: "b".repeat(64),
        recruiterTokenHash: "c".repeat(64),
        recruiterTokenExpiresAt: new Date("2026-08-09T12:03:00.000Z"),
        submittedAt: new Date("2026-07-10T12:03:00.000Z"),
        reason: "submitted"
      })
    ).resolves.toMatchObject({ newlyCompleted: true });
    expect(rpc).toHaveBeenCalledWith(
      "complete_hiring_assessment",
      expect.objectContaining({
        p_recruiter_token_hash: "c".repeat(64),
        p_recruiter_expires_at: "2026-08-09T12:03:00.000Z"
      })
    );
  });

  test("claims and records one persisted reminder attempt", async () => {
    const { repository, rpc } = fixture();
    const now = new Date("2026-07-11T12:00:00.000Z");

    await expect(
      repository.claimDueReminders({ now, limit: 25 })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "session-id",
        tokenHash: "a".repeat(64),
        reminderAttemptCount: 1,
        application: expect.objectContaining({
          idempotencyKey: "submission-1",
          email: "nino@example.com"
        })
      })
    ]);

    await expect(
      repository.recordReminderAttempt({
        sessionId: "session-id",
        attemptNumber: 1,
        status: "sent",
        providerMessageId: "email-1",
        errorCode: null,
        attemptedAt: now,
        nextAttemptAt: null
      })
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("claim_hiring_assessment_reminders", {
      p_now: now.toISOString(),
      p_limit: 25
    });
    expect(rpc).toHaveBeenCalledWith(
      "record_hiring_assessment_reminder",
      expect.objectContaining({
        p_session_id: "session-id",
        p_attempt_number: 1,
        p_status: "sent"
      })
    );
  });
});
