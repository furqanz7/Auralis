import {
  APPLICATION_MAX_CV_BYTES,
  applicationSchema
} from "../../shared/hiring/applicationSchema.js";
import { createOpaqueToken, hashToken } from "./tokens.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export class ApplicationDomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "ApplicationDomainError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new ApplicationDomainError(code, status);
}

function applicationResult(application) {
  return {
    applicationReference: application.reference
  };
}

function publicCampaign(campaign) {
  const { role } = campaign;
  return {
    id: campaign.id,
    label: campaign.label,
    expiresAt: campaign.expiresAt,
    role: {
      slug: role.slug,
      title: role.title,
      rateMin: role.rateMin,
      rateMax: role.rateMax,
      currency: role.currency,
      engagement: role.engagement,
      location: role.location,
      portfolioRequired: role.portfolioRequired
    }
  };
}

function validateCv({ fileName, mimeType, size }) {
  const hasPdfName = typeof fileName === "string" && /\.pdf$/i.test(fileName);
  if (
    !hasPdfName ||
    mimeType !== "application/pdf" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > APPLICATION_MAX_CV_BYTES
  ) {
    fail("INVALID_CV", 422);
  }
}

export function createApplicationService({
  repository,
  storage,
  email,
  turnstile,
  recruiterEmail = "auralis.careers@proton.me",
  clock = { now: () => new Date() },
  tokenFactory = () => createOpaqueToken(32),
  assessmentTokenFactory,
  referenceFactory = () =>
    `AUR-${createOpaqueToken(6).replace(/[-_]/g, "").slice(0, 8).toUpperCase()}`
}) {
  const createAssessmentToken =
    assessmentTokenFactory ?? (() => tokenFactory());

  async function findCampaign({ roleSlug, campaignToken }) {
    if (!roleSlug || !campaignToken) fail("CAMPAIGN_UNAVAILABLE", 404);

    let tokenHash;
    try {
      tokenHash = hashToken(campaignToken);
    } catch {
      fail("CAMPAIGN_UNAVAILABLE", 404);
    }

    const campaign = await repository.findCampaign({
      roleSlug,
      tokenHash,
      now: clock.now()
    });
    if (!campaign) fail("CAMPAIGN_UNAVAILABLE", 404);
    return campaign;
  }

  return {
    async validateCampaign(input) {
      return publicCampaign(await findCampaign(input));
    },

    async createUploadUrl({ campaignId, email: candidateEmail, fileName, mimeType, size }) {
      validateCv({ fileName, mimeType, size });
      if (typeof candidateEmail !== "string" || !candidateEmail.includes("@")) {
        fail("INVALID_APPLICATION", 422);
      }

      const campaign = await repository.findCampaignById({
        campaignId,
        now: clock.now()
      });
      if (!campaign) fail("CAMPAIGN_UNAVAILABLE", 404);

      const objectKey = `${campaign.id}/${tokenFactory()}/cv.pdf`;
      return storage.createSignedUploadUrl({
        objectKey,
        contentType: mimeType,
        size
      });
    },

    async submitApplication({
      idempotencyKey,
      campaignToken,
      roleSlug,
      payload,
      turnstileToken,
      remoteIp
    }) {
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
        fail("IDEMPOTENCY_KEY_REQUIRED", 400);
      }

      const existing = await repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return applicationResult(existing);

      const parsed = applicationSchema.safeParse(payload);
      if (!parsed.success) fail("INVALID_APPLICATION", 422);

      const campaign = await findCampaign({ roleSlug, campaignToken });

      try {
        const abuseResult = await turnstile.verify({
          token: turnstileToken,
          remoteIp,
          idempotencyKey
        });
        if (!abuseResult?.success) fail("ABUSE_CHECK_FAILED", 403);
      } catch (error) {
        if (error instanceof ApplicationDomainError) throw error;
        fail("ABUSE_CHECK_FAILED", 403);
      }

      const confirmedCv = await storage.confirmObject(parsed.data.cvObjectKey);
      const cvBelongsToCampaign = parsed.data.cvObjectKey.startsWith(`${campaign.id}/`);
      if (
        !confirmedCv ||
        !cvBelongsToCampaign ||
        confirmedCv.contentType !== parsed.data.cvMimeType ||
        confirmedCv.size !== parsed.data.cvSize
      ) {
        fail("INVALID_CV", 422);
      }

      const now = clock.now();
      const recent = await repository.findRecentApplication({
        campaignId: campaign.id,
        roleId: campaign.role.id ?? campaign.role.slug,
        email: parsed.data.email,
        since: new Date(now.getTime() - 30 * DAY_MS)
      });
      if (recent) return applicationResult(recent);

      const assessmentToken = createAssessmentToken({ idempotencyKey });
      const recruiterToken = tokenFactory();
      const application = await repository.createApplication({
        campaign,
        idempotencyKey,
        payload: parsed.data,
        reference: referenceFactory(),
        assessmentTokenHash: hashToken(assessmentToken),
        assessmentExpiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        recruiterTokenHash: hashToken(recruiterToken),
        recruiterTokenExpiresAt: new Date(now.getTime() + 30 * DAY_MS),
        now
      });

      await email.enqueueRecruiterApplication({
        to: recruiterEmail,
        application,
        recruiterToken,
        assessmentToken
      });

      return applicationResult(application);
    },

    async getRecruiterCv({ recruiterToken }) {
      let tokenHash;
      try {
        tokenHash = hashToken(recruiterToken);
      } catch {
        fail("CV_LINK_INVALID", 404);
      }

      const application = await repository.consumeAccessToken({
        tokenHash,
        scope: "recruiter_cv",
        now: clock.now()
      });
      if (!application) fail("CV_LINK_INVALID", 404);

      const expiresIn = 5 * 60;
      const url = await storage.createSignedDownloadUrl(
        application.cvObjectKey,
        expiresIn
      );
      return { url, expiresIn };
    }
  };
}
