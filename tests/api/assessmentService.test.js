import { describe, expect, test, vi } from "vitest";
import { createAssessmentService } from "../../api/_lib/assessmentService.js";
import { hashToken } from "../../api/_lib/tokens.js";

const START = new Date("2026-07-10T12:00:00.000Z");

function createFixture() {
  let now = new Date(START);
  let tokenSequence = 0;
  const state = {
    sessions: [],
    recruiterEmails: []
  };
  const application = {
    id: "application-1",
    reference: "AUR-1",
    fullName: "Nino Beridze",
    email: "nino@example.com",
    role: {
      slug: "senior-ai-product-engineer",
      title: "Senior AI Product Engineer"
    }
  };

  const repository = {
    async createInvitation(input) {
      const existing = state.sessions.find(
        (session) => session.application.id === input.application.id
      );
      if (existing) return existing;
      const session = {
        id: "session-1",
        application: input.application,
        tokenHash: input.tokenHash,
        assessmentVersion: input.assessmentVersion,
        invitationExpiresAt: input.expiresAt,
        startedAt: null,
        deadlineAt: null,
        submittedAt: null,
        responseVersion: 0,
        responses: new Map(),
        questionSnapshot: null,
        locked: false
      };
      state.sessions.push(session);
      return session;
    },
    async findSessionByTokenHash(tokenHash) {
      return state.sessions.find((session) => session.tokenHash === tokenHash) ?? null;
    },
    async startSession({ sessionId, questionSnapshot, startedAt, deadlineAt }) {
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (!session.startedAt) {
        session.questionSnapshot = questionSnapshot;
        session.startedAt = startedAt;
        session.deadlineAt = deadlineAt;
      }
      return session;
    },
    async saveAnswer({ sessionId, questionId, optionId, expectedVersion, savedAt }) {
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (expectedVersion !== session.responseVersion) {
        return { conflict: true, version: session.responseVersion };
      }
      session.responseVersion += 1;
      session.responses.set(questionId, { optionId, savedAt });
      return { conflict: false, version: session.responseVersion, savedAt };
    },
    async completeSession({ sessionId, result, verificationTokenHash, submittedAt, reason }) {
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      if (session.submittedAt) return { session, newlyCompleted: false };
      Object.assign(session, {
        submittedAt,
        rawScore: result.rawScore,
        dimensionScores: result.dimensionScores,
        verificationTokenHash,
        completionReason: reason,
        locked: true
      });
      return { session, newlyCompleted: true };
    }
  };
  const email = {
    enqueueRecruiterAssessment: vi.fn(async (input) => {
      state.recruiterEmails.push(input);
    })
  };
  const orderer = {
    order(items) {
      return [...items].reverse();
    }
  };
  const service = createAssessmentService({
    repository,
    email,
    clock: { now: () => new Date(now) },
    orderer,
    tokenFactory: () => `assessment-token-${++tokenSequence}-opaque-value`,
    verificationTokenFactory: ({ sessionId }) =>
      `verification-${sessionId}-opaque-value`
  });

  return {
    application,
    email,
    repository,
    service,
    state,
    setNow(value) {
      now = new Date(value);
    }
  };
}

async function inviteAndStart(fixture) {
  const invitation = await fixture.service.issueInvitation(fixture.application);
  const started = await fixture.service.startAssessment(invitation.token);
  return { invitation, started };
}

describe("assessment service", () => {
  test("issues an invitation that expires exactly 72 hours later", async () => {
    const fixture = createFixture();

    const invitation = await fixture.service.issueInvitation(fixture.application);

    expect(invitation.expiresAt.toISOString()).toBe("2026-07-13T12:00:00.000Z");
    expect(fixture.state.sessions[0].tokenHash).toBe(hashToken(invitation.token));
  });

  test("starts with a deterministic immutable 18-question snapshot", async () => {
    const fixture = createFixture();
    const { started } = await inviteAndStart(fixture);

    expect(started.status).toBe("started");
    expect(started.questions).toHaveLength(18);
    expect(started.questions[0].id).toBe("ai-18");
    expect(fixture.state.sessions[0].questionSnapshot).toHaveLength(18);
    expect(fixture.state.sessions[0].deadlineAt.toISOString()).toBe(
      "2026-07-10T12:20:00.000Z"
    );
  });

  test("never includes correctness in the browser payload", async () => {
    const fixture = createFixture();
    const { started } = await inviteAndStart(fixture);

    expect(started.questions[0]).not.toHaveProperty("correctOptionId");
    expect(JSON.stringify(started)).not.toContain("correctOptionId");
  });

  test("is idempotent and never resets the timer", async () => {
    const fixture = createFixture();
    const invitation = await fixture.service.issueInvitation(fixture.application);
    const first = await fixture.service.startAssessment(invitation.token);
    fixture.setNow("2026-07-10T12:05:00.000Z");
    const second = await fixture.service.startAssessment(invitation.token);

    expect(second.deadlineAt).toEqual(first.deadlineAt);
    expect(fixture.state.sessions[0].startedAt.toISOString()).toBe(
      "2026-07-10T12:00:00.000Z"
    );
  });

  test("rejects unknown answers and stale response versions", async () => {
    const fixture = createFixture();
    const { invitation, started } = await inviteAndStart(fixture);

    await expect(
      fixture.service.saveAnswer(invitation.token, "unknown-question", "a", 0)
    ).rejects.toMatchObject({ code: "ANSWER_INVALID" });
    await expect(
      fixture.service.saveAnswer(invitation.token, started.questions[0].id, "unknown", 0)
    ).rejects.toMatchObject({ code: "ANSWER_INVALID" });
    await fixture.service.saveAnswer(invitation.token, started.questions[0].id, "a", 0);
    await expect(
      fixture.service.saveAnswer(invitation.token, started.questions[1].id, "a", 0)
    ).rejects.toMatchObject({ code: "ANSWER_CONFLICT" });
  });

  test("locks responses and computes total plus four dimensions", async () => {
    const fixture = createFixture();
    const { invitation, started } = await inviteAndStart(fixture);
    let version = 0;
    for (const question of started.questions) {
      const saved = await fixture.service.saveAnswer(
        invitation.token,
        question.id,
        "a",
        version
      );
      version = saved.version;
    }

    const result = await fixture.service.submitAssessment(invitation.token);

    expect(result).toEqual({
      applicationReference: "AUR-1",
      verificationToken: expect.any(String)
    });
    expect(fixture.state.sessions[0].rawScore).toBe(18);
    expect(fixture.state.sessions[0].dimensionScores).toEqual({
      craft: 6,
      systems: 4,
      judgment: 4,
      delivery: 4
    });
    expect(fixture.state.sessions[0].locked).toBe(true);
    expect(fixture.state.recruiterEmails[0].recruiterToken).toMatch(
      /^assessment-token-/
    );
  });

  test("returns an existing submission without duplicate recruiter email", async () => {
    const fixture = createFixture();
    const { invitation } = await inviteAndStart(fixture);

    const first = await fixture.service.submitAssessment(invitation.token);
    const second = await fixture.service.submitAssessment(invitation.token);

    expect(second).toEqual(first);
    expect(fixture.email.enqueueRecruiterAssessment).toHaveBeenCalledTimes(1);
    await expect(
      fixture.service.getAssessment(invitation.token)
    ).resolves.toEqual({
      status: "submitted",
      verificationToken: first.verificationToken
    });
  });

  test("server expiry submits saved answers and locks the attempt", async () => {
    const fixture = createFixture();
    const { invitation, started } = await inviteAndStart(fixture);
    await fixture.service.saveAnswer(invitation.token, started.questions[0].id, "a", 0);
    fixture.setNow("2026-07-10T12:20:01.000Z");

    await expect(
      fixture.service.submitAssessment(invitation.token)
    ).rejects.toMatchObject({ code: "ASSESSMENT_EXPIRED" });

    expect(fixture.state.sessions[0]).toMatchObject({
      completionReason: "expired",
      locked: true,
      rawScore: 1
    });
    await expect(
      fixture.service.getAssessment(invitation.token)
    ).resolves.toEqual({ status: "submitted", verificationToken: null });
  });

  test("never creates pass, fail, rejection, or candidate score state", async () => {
    const fixture = createFixture();
    const { invitation } = await inviteAndStart(fixture);

    const result = await fixture.service.submitAssessment(invitation.token);

    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("passed");
    expect(fixture.state.sessions[0]).not.toHaveProperty("rejected");
  });
});
