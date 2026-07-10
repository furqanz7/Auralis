import { createClient } from "@supabase/supabase-js";
import { readServerEnv } from "../env.js";

const adminOptions = Object.freeze({
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

export function createSupabaseAdmin(env, createClientImpl = createClient) {
  return createClientImpl(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    adminOptions
  );
}

let adminClient;

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createSupabaseAdmin(readServerEnv());
  }

  return adminClient;
}

function assertSupabaseResult({ data, error }, operation) {
  if (error) throw new Error(`Supabase ${operation} failed.`);
  return data;
}

export function createSupabaseHiringStorage({ client, bucket }) {
  const files = client.storage.from(bucket);

  return {
    async createSignedUploadUrl({ objectKey }) {
      const data = assertSupabaseResult(
        await files.createSignedUploadUrl(objectKey, { upsert: false }),
        "signed upload"
      );
      return {
        objectKey,
        uploadUrl: data.signedUrl,
        uploadToken: data.token
      };
    },

    async confirmObject(objectKey) {
      const result = await files.info(objectKey);
      if (result.error) {
        const status = Number(result.error.status ?? result.error.statusCode);
        if (status === 404) return null;
        throw new Error("Supabase object confirmation failed.");
      }
      return {
        objectKey,
        contentType: result.data.content_type,
        size: result.data.size
      };
    },

    async createSignedDownloadUrl(objectKey, expiresIn) {
      const data = assertSupabaseResult(
        await files.createSignedUrl(objectKey, expiresIn, { download: true }),
        "signed download"
      );
      return data.signedUrl;
    },

    async deleteObject(objectKey) {
      assertSupabaseResult(
        await files.remove([objectKey]),
        "object deletion"
      );
      return { deleted: true };
    }
  };
}

function firstRow(result, operation) {
  const data = assertSupabaseResult(result, operation);
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function mapApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
    fullName: row.full_name,
    email: row.email,
    country: row.country,
    timeZone: row.time_zone,
    profileUrl: row.profile_url ?? "",
    availability: row.availability,
    cvObjectKey: row.cv_object_key,
    lifecycleState: row.lifecycle_state,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    result: {
      applicationReference: row.reference
    }
  };
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    expiresAt: new Date(row.expires_at),
    role: {
      id: row.role_id,
      slug: row.role_slug,
      title: row.role_title,
      rateMin: row.rate_min,
      rateMax: row.rate_max,
      currency: row.currency,
      engagement: row.engagement,
      location: row.location,
      portfolioRequired: row.portfolio_required
    }
  };
}

export function createSupabaseApplicationRepository({ client }) {
  async function getCampaign(args) {
    return mapCampaign(
      firstRow(
        await client.rpc("get_active_hiring_campaign", args),
        "campaign lookup"
      )
    );
  }

  return {
    async findCampaign({ roleSlug, tokenHash, now }) {
      return getCampaign({
        p_role_slug: roleSlug,
        p_token_hash: tokenHash,
        p_campaign_id: null,
        p_now: now.toISOString()
      });
    },

    async findCampaignById({ campaignId, now }) {
      return getCampaign({
        p_role_slug: null,
        p_token_hash: null,
        p_campaign_id: campaignId,
        p_now: now.toISOString()
      });
    },

    async findByIdempotencyKey(idempotencyKey) {
      return mapApplication(
        firstRow(
          await client.rpc("find_hiring_application_by_idempotency", {
            p_idempotency_key: idempotencyKey
          }),
          "idempotency lookup"
        )
      );
    },

    async findRecentApplication({ campaignId, roleId, email, since }) {
      return mapApplication(
        firstRow(
          await client.rpc("find_recent_hiring_application", {
            p_campaign_id: campaignId,
            p_role_id: roleId,
            p_email: email,
            p_since: since.toISOString()
          }),
          "recent application lookup"
        )
      );
    },

    async createApplication(input) {
      const { campaign, payload } = input;
      const row = firstRow(
        await client.rpc("create_hiring_application", {
          p_campaign_id: campaign.id,
          p_role_id: campaign.role.id,
          p_idempotency_key: input.idempotencyKey,
          p_reference: input.reference,
          p_full_name: payload.fullName,
          p_email: payload.email,
          p_country: payload.country,
          p_time_zone: payload.timeZone,
          p_profile_url: payload.profileUrl,
          p_availability: payload.availability,
          p_cv_object_key: payload.cvObjectKey,
          p_cv_mime_type: payload.cvMimeType,
          p_cv_size: payload.cvSize,
          p_assessment_token_hash: input.assessmentTokenHash,
          p_assessment_expires_at: input.assessmentExpiresAt.toISOString(),
          p_recruiter_token_hash: input.recruiterTokenHash,
          p_recruiter_expires_at: input.recruiterTokenExpiresAt.toISOString(),
          p_now: input.now.toISOString()
        }),
        "application creation"
      );
      if (!row) throw new Error("Supabase application creation failed.");
      return {
        ...mapApplication(row),
        campaign,
        role: campaign.role
      };
    },

    async consumeAccessToken({ tokenHash, scope, now }) {
      return mapApplication(
        firstRow(
          await client.rpc("consume_hiring_access_token", {
            p_token_hash: tokenHash,
            p_scope: scope,
            p_now: now.toISOString()
          }),
          "access token consumption"
        )
      );
    }
  };
}

function optionalDate(value) {
  return value ? new Date(value) : null;
}

function mapAssessmentSession(row) {
  if (!row) return null;
  const questionSnapshot =
    typeof row.question_snapshot === "string"
      ? JSON.parse(row.question_snapshot)
      : row.question_snapshot;
  const responses =
    typeof row.responses === "string" ? JSON.parse(row.responses) : row.responses;
  return {
    id: row.id,
    tokenHash: row.token_hash,
    assessmentVersion: row.assessment_version,
    questionSnapshot,
    invitationExpiresAt: optionalDate(row.invitation_expires_at),
    startedAt: optionalDate(row.started_at),
    deadlineAt: optionalDate(row.deadline_at),
    submittedAt: optionalDate(row.submitted_at),
    rawScore: row.raw_score,
    dimensionScores: row.dimension_scores,
    responseVersion: row.response_version,
    locked: row.locked,
    completionReason: row.completion_reason,
    responses: responses ?? [],
    application: {
      id: row.application_id,
      reference: row.application_reference,
      fullName: row.full_name,
      email: row.email,
      cvObjectKey: row.cv_object_key,
      role: {
        id: row.role_id,
        slug: row.role_slug,
        title: row.role_title
      }
    }
  };
}

function mapAssessmentReminder(row) {
  if (!row) return null;
  return {
    id: row.id,
    tokenHash: row.token_hash,
    invitationIssuedAt: optionalDate(row.invitation_issued_at),
    invitationExpiresAt: optionalDate(row.invitation_expires_at),
    startedAt: optionalDate(row.started_at),
    submittedAt: optionalDate(row.submitted_at),
    locked: row.locked,
    reminderSentAt: optionalDate(row.reminder_sent_at),
    reminderAttemptCount: row.reminder_attempt_count,
    application: {
      id: row.application_id,
      reference: row.application_reference,
      idempotencyKey: row.application_idempotency_key,
      fullName: row.full_name,
      email: row.email,
      role: {
        id: row.role_id,
        slug: row.role_slug,
        title: row.role_title
      }
    }
  };
}

export function createSupabaseAssessmentRepository({ client }) {
  async function getSession({ tokenHash = null, sessionId = null }) {
    return mapAssessmentSession(
      firstRow(
        await client.rpc("get_hiring_assessment_session", {
          p_token_hash: tokenHash,
          p_session_id: sessionId
        }),
        "assessment session lookup"
      )
    );
  }

  return {
    async createInvitation(input) {
      assertSupabaseResult(
        await client.rpc("issue_hiring_assessment_invitation", {
          p_application_id: input.application.id,
          p_token_hash: input.tokenHash,
          p_assessment_version: input.assessmentVersion,
          p_expires_at: input.expiresAt.toISOString(),
          p_now: input.now.toISOString()
        }),
        "assessment invitation"
      );
      return getSession({ tokenHash: input.tokenHash });
    },

    async findSessionByTokenHash(tokenHash) {
      return getSession({ tokenHash });
    },

    async startSession({ sessionId, questionSnapshot, startedAt, deadlineAt }) {
      assertSupabaseResult(
        await client.rpc("start_hiring_assessment", {
          p_session_id: sessionId,
          p_question_snapshot: questionSnapshot,
          p_started_at: startedAt.toISOString(),
          p_deadline_at: deadlineAt.toISOString()
        }),
        "assessment start"
      );
      return getSession({ sessionId });
    },

    async saveAnswer({ sessionId, questionId, optionId, expectedVersion, savedAt }) {
      const row = firstRow(
        await client.rpc("save_hiring_assessment_answer", {
          p_session_id: sessionId,
          p_question_id: questionId,
          p_option_id: optionId,
          p_expected_version: expectedVersion,
          p_saved_at: savedAt.toISOString()
        }),
        "assessment answer save"
      );
      if (!row) throw new Error("Supabase assessment answer save failed.");
      return {
        conflict: row.conflict,
        version: row.version,
        savedAt: new Date(row.saved_at)
      };
    },

    async completeSession({
      sessionId,
      result,
      verificationTokenHash,
      recruiterTokenHash,
      recruiterTokenExpiresAt,
      submittedAt,
      reason
    }) {
      const completed = assertSupabaseResult(
        await client.rpc("complete_hiring_assessment", {
          p_session_id: sessionId,
          p_raw_score: result.rawScore,
          p_dimension_scores: result.dimensionScores,
          p_verification_token_hash: verificationTokenHash,
          p_recruiter_token_hash: recruiterTokenHash,
          p_recruiter_expires_at: recruiterTokenExpiresAt.toISOString(),
          p_submitted_at: submittedAt.toISOString(),
          p_reason: reason
        }),
        "assessment completion"
      );
      return {
        session: await getSession({ sessionId }),
        newlyCompleted: completed === true
      };
    },

    async claimDueReminders({ now, limit }) {
      const data = assertSupabaseResult(
        await client.rpc("claim_hiring_assessment_reminders", {
          p_now: now.toISOString(),
          p_limit: limit
        }),
        "assessment reminder claim"
      );
      return (Array.isArray(data) ? data : data ? [data] : [])
        .map(mapAssessmentReminder)
        .filter(Boolean);
    },

    async recordReminderAttempt(input) {
      const recorded = assertSupabaseResult(
        await client.rpc("record_hiring_assessment_reminder", {
          p_session_id: input.sessionId,
          p_attempt_number: input.attemptNumber,
          p_status: input.status,
          p_provider_message_id: input.providerMessageId,
          p_error_code: input.errorCode,
          p_attempted_at: input.attemptedAt.toISOString(),
          p_next_attempt_at: input.nextAttemptAt?.toISOString() ?? null
        }),
        "assessment reminder result"
      );
      return recorded === true;
    }
  };
}

function mapVerificationApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    fullName: row.full_name,
    email: row.email,
    lifecycleState: row.lifecycle_state,
    cvObjectKey: row.cv_object_key,
    role: row.role
      ? {
          id: row.role.id,
          slug: row.role.slug,
          title: row.role.title
        }
      : null
  };
}

function mapPaymentVerification(row) {
  if (!row) return null;
  return {
    id: row.id,
    merchantReference: row.merchant_reference,
    providerPaymentId: row.provider_payment_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    preAuth: row.pre_auth,
    idempotencyKey: row.idempotency_key,
    approvalUrl: row.approval_url,
    sessionExpiresAt: optionalDate(row.session_expires_at),
    returnTokenHash: row.return_token_hash,
    returnTokenExpiresAt: optionalDate(row.return_token_expires_at),
    state: row.state,
    providerState: row.provider_state,
    cancellationState: row.cancellation_state,
    cancellationAttemptCount: row.cancellation_attempt_count,
    nextRetryAt: optionalDate(row.next_retry_at),
    callbackReceivedAt: optionalDate(row.callback_received_at),
    completedAt: optionalDate(row.completed_at),
    failedAt: optionalDate(row.failed_at),
    errorCategory: row.error_category,
    application: mapVerificationApplication(row.application)
  };
}

function mapVerificationRecord(payload) {
  if (!payload) return null;
  if (Object.hasOwn(payload, "verification")) {
    return {
      application: mapVerificationApplication(payload.application),
      verification: mapPaymentVerification(payload.verification)
    };
  }
  const verification = mapPaymentVerification(payload);
  return {
    application: verification?.application ?? null,
    verification
  };
}

export function createSupabaseVerificationRepository({ client }) {
  async function getById(verificationId) {
    return mapPaymentVerification(
      firstRow(
        await client.rpc("get_hiring_verification_by_id", {
          p_verification_id: verificationId
        }),
        "verification lookup"
      )
    );
  }

  return {
    async findApplicationByVerificationTokenHash(tokenHash, now) {
      return mapVerificationApplication(
        firstRow(
          await client.rpc("get_hiring_application_for_verification", {
            p_token_hash: tokenHash,
            p_now: now.toISOString()
          }),
          "verification application lookup"
        )
      );
    },

    async reserveVerification(input) {
      const payload = firstRow(
        await client.rpc("reserve_hiring_payment_verification", {
          p_application_id: input.application.id,
          p_merchant_reference: input.merchantReference,
          p_idempotency_key: input.idempotencyKey,
          p_return_token_hash: input.returnTokenHash,
          p_return_token_expires_at: input.returnTokenExpiresAt.toISOString(),
          p_amount_minor: input.amountMinor,
          p_currency: input.currency,
          p_pre_auth: input.preAuth,
          p_now: input.createdAt.toISOString()
        }),
        "verification reservation"
      );
      if (!payload) throw new Error("Supabase verification reservation failed.");
      return {
        verification: mapPaymentVerification(payload),
        newlyCreated: payload.newly_created === true
      };
    },

    async activateVerification(input) {
      return mapPaymentVerification(
        firstRow(
          await client.rpc("activate_hiring_payment_verification", {
            p_verification_id: input.verificationId,
            p_provider_payment_id: input.providerPaymentId,
            p_approval_url: input.approvalUrl,
            p_session_expires_at: input.sessionExpiresAt.toISOString(),
            p_activated_at: input.activatedAt.toISOString()
          }),
          "verification activation"
        )
      );
    },

    async findByProviderPaymentId(providerPaymentId) {
      return mapPaymentVerification(
        firstRow(
          await client.rpc("get_hiring_verification_by_provider_payment", {
            p_provider_payment_id: providerPaymentId
          }),
          "provider payment lookup"
        )
      );
    },

    async findVerificationById(verificationId) {
      return getById(verificationId);
    },

    async beginCancellation(input) {
      const acquired = assertSupabaseResult(
        await client.rpc("begin_hiring_verification_cancellation", {
          p_verification_id: input.verificationId,
          p_provider_state: input.providerState,
          p_callback_at: input.callbackAt.toISOString()
        }),
        "verification cancellation claim"
      );
      return {
        acquired: acquired === true,
        verification: await getById(input.verificationId)
      };
    },

    async completeCancellation(input) {
      const completed = assertSupabaseResult(
        await client.rpc("complete_hiring_verification_cancellation", {
          p_verification_id: input.verificationId,
          p_completed_at: input.completedAt.toISOString()
        }),
        "verification completion"
      );
      return {
        newlyCompleted: completed === true,
        verification: await getById(input.verificationId)
      };
    },

    async failVerification(input) {
      const failed = assertSupabaseResult(
        await client.rpc("fail_hiring_payment_verification", {
          p_verification_id: input.verificationId,
          p_provider_state: input.providerState,
          p_error_category: input.errorCategory,
          p_failed_at: input.failedAt.toISOString()
        }),
        "verification failure"
      );
      return {
        newlyFailed: failed === true,
        verification: await getById(input.verificationId)
      };
    },

    async scheduleCancellationRetry(input) {
      assertSupabaseResult(
        await client.rpc("schedule_hiring_verification_retry", {
          p_verification_id: input.verificationId,
          p_attempt_number: input.attemptNumber,
          p_next_retry_at: input.nextRetryAt.toISOString(),
          p_error_category: input.errorCategory,
          p_attempted_at: input.attemptedAt.toISOString()
        }),
        "verification retry schedule"
      );
      return getById(input.verificationId);
    },

    async findByAccessTokenHash(tokenHash, now) {
      return mapVerificationRecord(
        firstRow(
          await client.rpc("get_hiring_verification_by_token", {
            p_token_hash: tokenHash,
            p_now: now.toISOString()
          }),
          "verification status lookup"
        )
      );
    },

    async claimDueCancellations({ now, limit }) {
      const data = assertSupabaseResult(
        await client.rpc("claim_hiring_verification_retries", {
          p_now: now.toISOString(),
          p_limit: limit
        }),
        "verification retry claim"
      );
      return (Array.isArray(data) ? data : data ? [data] : [])
        .map(mapPaymentVerification)
        .filter(Boolean);
    }
  };
}

function mapPrivacyApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    fullName: row.full_name,
    email: row.email,
    cvObjectKey: row.cv_object_key,
    deletionDueAt: optionalDate(row.deletion_due_at),
    deletionAttemptCount: row.deletion_attempt_count,
    role: row.role
      ? {
          slug: row.role.slug,
          title: row.role.title
        }
      : null
  };
}

export function createSupabasePrivacyRepository({ client }) {
  return {
    async claimExpiredApplications({ now, limit }) {
      const data = assertSupabaseResult(
        await client.rpc("claim_hiring_applications_for_deletion", {
          p_now: now.toISOString(),
          p_limit: limit
        }),
        "retention deletion claim"
      );
      return (Array.isArray(data) ? data : data ? [data] : [])
        .map(mapPrivacyApplication)
        .filter(Boolean);
    },

    async createDeletionRequest(input) {
      return mapPrivacyApplication(
        firstRow(
          await client.rpc("create_hiring_deletion_request", {
            p_email: input.email,
            p_token_hash: input.tokenHash,
            p_expires_at: input.expiresAt.toISOString(),
            p_now: input.now.toISOString()
          }),
          "privacy deletion request"
        )
      );
    },

    async claimDeletionByTokenHash(tokenHash, now) {
      return mapPrivacyApplication(
        firstRow(
          await client.rpc("claim_hiring_deletion_by_token", {
            p_token_hash: tokenHash,
            p_now: now.toISOString()
          }),
          "privacy deletion confirmation"
        )
      );
    },

    async finalizeApplicationDeletion(input) {
      return (
        assertSupabaseResult(
          await client.rpc("finalize_hiring_application_deletion", {
            p_application_id: input.applicationId,
            p_reason: input.reason,
            p_deleted_at: input.deletedAt.toISOString()
          }),
          "privacy deletion finalization"
        ) === true
      );
    },

    async recordDeletionFailure(input) {
      return (
        assertSupabaseResult(
          await client.rpc("record_hiring_application_deletion_failure", {
            p_application_id: input.applicationId,
            p_attempt_number: input.attemptNumber,
            p_error_category: input.errorCategory,
            p_attempted_at: input.attemptedAt.toISOString(),
            p_next_attempt_at: input.nextAttemptAt.toISOString()
          }),
          "privacy deletion retry"
        ) === true
      );
    }
  };
}
