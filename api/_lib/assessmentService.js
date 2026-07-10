import { createHmac } from "node:crypto";
import { getAssessmentDefinition } from "../../shared/hiring/questions/index.js";
import { createOpaqueToken, hashToken, safeEqualHash } from "./tokens.js";

const HOUR_MS = 60 * 60 * 1000;
const REMINDER_RETRY_BASE_MS = 15 * 60 * 1000;
const REMINDER_RETRY_MAX_MS = 6 * HOUR_MS;

export class AssessmentDomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "AssessmentDomainError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new AssessmentDomainError(code, status);
}

export function createAssessmentOrderer(secret) {
  return {
    order(items, seed) {
      return items
        .map((item, index) => ({
          item,
          key: createHmac("sha256", secret)
            .update(`${seed}:${item.id ?? index}`)
            .digest("hex")
        }))
        .sort((left, right) => left.key.localeCompare(right.key))
        .map(({ item }) => item);
    }
  };
}

export function createVerificationTokenFactory(secret) {
  return ({ sessionId, applicationId }) =>
    createHmac("sha256", secret)
      .update(`verification:${applicationId}:${sessionId}`)
      .digest("base64url");
}

function snapshotQuestions(definition, session, orderer) {
  return orderer
    .order(definition.questions, `${session.application.id}:${definition.version}:questions`)
    .map((question) => ({
      ...question,
      options: orderer.order(
        question.options,
        `${session.application.id}:${definition.version}:${question.id}:options`
      )
    }));
}

function browserQuestions(snapshot) {
  return snapshot.map(({ correctOptionId: _correctOptionId, ...question }) => ({
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }));
}

function responseEntries(session) {
  if (session.responses instanceof Map) return session.responses;
  if (Array.isArray(session.responses)) {
    return new Map(
      session.responses.map((response) => [
        response.questionId ?? response.question_id,
        { optionId: response.optionId ?? response.selected_option_id }
      ])
    );
  }
  return new Map(Object.entries(session.responses ?? {}));
}

function scoreSession(session, submittedAt) {
  const dimensionScores = { craft: 0, systems: 0, judgment: 0, delivery: 0 };
  const responses = responseEntries(session);
  let rawScore = 0;

  for (const question of session.questionSnapshot) {
    const selected = responses.get(question.id)?.optionId;
    if (selected === question.correctOptionId) {
      rawScore += 1;
      dimensionScores[question.dimension] += 1;
    }
  }

  const durationSeconds = Math.max(
    0,
    Math.min(
      1200,
      Math.round((submittedAt.getTime() - session.startedAt.getTime()) / 1000)
    )
  );
  return { rawScore, dimensionScores, durationSeconds };
}

function browserSession(session) {
  return {
    applicationReference: session.application.reference,
    role: session.application.role,
    questions: browserQuestions(session.questionSnapshot),
    startedAt: session.startedAt,
    deadlineAt: session.deadlineAt,
    responseVersion: session.responseVersion,
    responses: Object.fromEntries(
      [...responseEntries(session)].map(([questionId, response]) => [
        questionId,
        response.optionId
      ])
    )
  };
}

export function createAssessmentService({
  repository,
  email,
  clock = { now: () => new Date() },
  orderer = { order: (items) => [...items] },
  tokenFactory = () => createOpaqueToken(32),
  verificationTokenFactory,
  reminderTokenFactory
}) {
  if (typeof verificationTokenFactory !== "function") {
    throw new TypeError("Assessment service requires a verification token factory.");
  }

  async function findSession(token) {
    let tokenHash;
    try {
      tokenHash = hashToken(token);
    } catch {
      fail("ASSESSMENT_INVALID", 404);
    }
    const session = await repository.findSessionByTokenHash(tokenHash);
    if (!session) fail("ASSESSMENT_INVALID", 404);
    if (!session.startedAt && session.invitationExpiresAt <= clock.now()) {
      fail("ASSESSMENT_EXPIRED", 410);
    }
    return session;
  }

  function reminderRetryAt(now, attemptNumber) {
    const exponent = Math.max(0, Math.min(8, attemptNumber - 1));
    const delay = Math.min(
      REMINDER_RETRY_MAX_MS,
      REMINDER_RETRY_BASE_MS * 2 ** exponent
    );
    return new Date(now.getTime() + delay);
  }

  async function recordReminderFailure(session, now, errorCode) {
    await repository.recordReminderAttempt({
      sessionId: session.id,
      attemptNumber: session.reminderAttemptCount,
      status: "failed",
      providerMessageId: null,
      errorCode,
      attemptedAt: now,
      nextAttemptAt: reminderRetryAt(now, session.reminderAttemptCount)
    });
  }

  async function finalize(session, reason) {
    const verificationToken =
      reason === "submitted"
        ? verificationTokenFactory({
            sessionId: session.id,
            applicationId: session.application.id
          })
        : null;

    if (session.submittedAt) {
      return {
        applicationReference: session.application.reference,
        verificationToken
      };
    }

    const submittedAt = clock.now();
    const result = scoreSession(session, submittedAt);
    const recruiterToken = tokenFactory();
    const completion = await repository.completeSession({
      sessionId: session.id,
      result,
      verificationTokenHash: verificationToken ? hashToken(verificationToken) : null,
      recruiterTokenHash: hashToken(recruiterToken),
      recruiterTokenExpiresAt: new Date(submittedAt.getTime() + 30 * 24 * HOUR_MS),
      submittedAt,
      reason
    });
    if (completion.newlyCompleted) {
      await Promise.allSettled([
        email.enqueueRecruiterAssessment({
          application: session.application,
          result,
          reason,
          recruiterToken
        })
      ]);
    }
    return {
      applicationReference: session.application.reference,
      verificationToken
    };
  }

  return {
    async issueInvitation(application) {
      const definition = getAssessmentDefinition(application.role.slug);
      if (!definition) fail("ASSESSMENT_INVALID", 404);
      const token = tokenFactory();
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + 72 * HOUR_MS);
      await repository.createInvitation({
        application,
        tokenHash: hashToken(token),
        assessmentVersion: definition.version,
        expiresAt,
        now
      });
      return { token, expiresAt };
    },

    async getAssessment(token) {
      const session = await findSession(token);
      if (session.submittedAt) {
        return {
          status: "submitted",
          verificationToken:
            session.completionReason === "submitted"
              ? verificationTokenFactory({
                  sessionId: session.id,
                  applicationId: session.application.id
                })
              : null
        };
      }
      if (!session.startedAt) {
        return {
          status: "invited",
          role: session.application.role,
          expiresAt: session.invitationExpiresAt,
          durationSeconds: 1200,
          questionCount: 18
        };
      }
      return { status: "started", ...browserSession(session) };
    },

    async startAssessment(token) {
      let session = await findSession(token);
      if (session.submittedAt || session.locked) fail("ASSESSMENT_LOCKED", 409);
      if (!session.startedAt) {
        const definition = getAssessmentDefinition(session.application.role.slug);
        if (!definition || definition.version !== session.assessmentVersion) {
          fail("ASSESSMENT_INVALID", 404);
        }
        const startedAt = clock.now();
        session = await repository.startSession({
          sessionId: session.id,
          questionSnapshot: snapshotQuestions(definition, session, orderer),
          startedAt,
          deadlineAt: new Date(startedAt.getTime() + definition.durationSeconds * 1000)
        });
      }
      return browserSession(session);
    },

    async saveAnswer(token, questionId, optionId, version) {
      const session = await findSession(token);
      if (!session.startedAt) fail("ASSESSMENT_INVALID", 409);
      if (session.submittedAt || session.locked) fail("ASSESSMENT_LOCKED", 409);
      if (clock.now() >= session.deadlineAt) {
        await finalize(session, "expired");
        fail("ASSESSMENT_EXPIRED", 410);
      }

      const question = session.questionSnapshot.find(
        (candidate) => candidate.id === questionId
      );
      if (!question || !question.options.some((option) => option.id === optionId)) {
        fail("ANSWER_INVALID", 422);
      }
      if (!Number.isInteger(version) || version < 0) fail("ANSWER_INVALID", 422);

      const saved = await repository.saveAnswer({
        sessionId: session.id,
        questionId,
        optionId,
        expectedVersion: version,
        savedAt: clock.now()
      });
      if (saved.conflict) fail("ANSWER_CONFLICT", 409);
      return { savedAt: saved.savedAt, version: saved.version };
    },

    async submitAssessment(token) {
      const session = await findSession(token);
      if (!session.startedAt) fail("ASSESSMENT_INVALID", 409);
      const reason = clock.now() >= session.deadlineAt ? "expired" : "submitted";
      const result = await finalize(session, reason);
      if (reason === "expired") fail("ASSESSMENT_EXPIRED", 410);
      return result;
    },

    async sendDueReminders({ limit = 50 } = {}) {
      if (
        typeof reminderTokenFactory !== "function" ||
        typeof repository.claimDueReminders !== "function" ||
        typeof repository.recordReminderAttempt !== "function"
      ) {
        throw new TypeError("Assessment reminder delivery is not configured.");
      }

      const now = clock.now();
      const claimed = await repository.claimDueReminders({
        now,
        limit: Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 50))
      });
      const summary = {
        claimed: claimed.length,
        sent: 0,
        failed: 0,
        skipped: 0
      };

      for (const session of claimed) {
        const ineligible =
          session.startedAt ||
          session.submittedAt ||
          session.locked ||
          session.reminderSentAt ||
          !session.invitationExpiresAt ||
          session.invitationExpiresAt <= now;
        if (ineligible) {
          summary.skipped += 1;
          continue;
        }

        let assessmentToken;
        try {
          assessmentToken = reminderTokenFactory({
            idempotencyKey: session.application.idempotencyKey
          });
        } catch {
          await recordReminderFailure(session, now, "TOKEN_REGENERATION_FAILED");
          summary.failed += 1;
          continue;
        }

        if (!safeEqualHash(hashToken(assessmentToken), session.tokenHash)) {
          await recordReminderFailure(session, now, "TOKEN_HASH_MISMATCH");
          summary.failed += 1;
          continue;
        }

        try {
          const delivery = await email.enqueueAssessmentReminder({
            session,
            assessmentToken
          });
          await repository.recordReminderAttempt({
            sessionId: session.id,
            attemptNumber: session.reminderAttemptCount,
            status: "sent",
            providerMessageId: delivery.providerMessageId,
            errorCode: null,
            attemptedAt: now,
            nextAttemptAt: null
          });
          summary.sent += 1;
        } catch {
          await recordReminderFailure(session, now, "EMAIL_PROVIDER_REJECTED");
          summary.failed += 1;
        }
      }

      return summary;
    }
  };
}
