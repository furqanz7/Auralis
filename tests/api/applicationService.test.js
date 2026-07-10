import { describe, expect, test, vi } from "vitest";
import { hashToken } from "../../api/_lib/tokens.js";
import { createApplicationService } from "../../api/_lib/applicationService.js";
import { getRoleBySlug } from "../../shared/hiring/roles.js";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const MAX_CV_BYTES = 5 * 1024 * 1024;

const validPayload = {
  fullName: "Nino Beridze",
  email: "nino@example.com",
  country: "Georgia",
  timeZone: "Asia/Tbilisi",
  profileUrl: "https://www.linkedin.com/in/nino-beridze",
  availability: "20-30 hours",
  cvObjectKey: "campaign-1/upload-1/cv.pdf",
  cvMimeType: "application/pdf",
  cvSize: 2048,
  privacyAccepted: true
};

function createFixture({ assessmentTokenFactory } = {}) {
  const state = {
    applications: [],
    recruiterEmails: [],
    tokens: [],
    uploadRequests: [],
    downloadRequests: []
  };
  const role = getRoleBySlug("senior-ai-product-engineer");
  const campaign = {
    id: "campaign-1",
    label: "Instagram / AI product",
    role,
    tokenHash: hashToken("campaign-token"),
    activeAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    revokedAt: null
  };
  const directCampaign = {
    id: "direct-campaign-1",
    label: "Direct application intake",
    role,
    activeAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: new Date("2100-01-01T00:00:00.000Z"),
    revokedAt: null
  };

  function campaignIsAvailable(candidate, now) {
    return (
      candidate &&
      !candidate.revokedAt &&
      candidate.activeAt <= now &&
      candidate.expiresAt > now
    );
  }

  const repository = {
    async findCampaign({ roleSlug, tokenHash, now }) {
      if (
        roleSlug === role.slug &&
        tokenHash === campaign.tokenHash &&
        campaignIsAvailable(campaign, now)
      ) {
        return campaign;
      }
      return null;
    },
    async findCampaignById({ campaignId, now }) {
      return campaignId === campaign.id && campaignIsAvailable(campaign, now)
        ? campaign
        : null;
    },
    async findDirectCampaign({ roleSlug, now }) {
      return roleSlug === role.slug && campaignIsAvailable(directCampaign, now)
        ? directCampaign
        : null;
    },
    async listDirectCampaigns({ now }) {
      return campaignIsAvailable(directCampaign, now) ? [directCampaign] : [];
    },
    async findByIdempotencyKey(idempotencyKey) {
      return (
        state.applications.find(
          (application) => application.idempotencyKey === idempotencyKey
        ) ?? null
      );
    },
    async findRecentApplication({ campaignId, roleId, email, since }) {
      return (
        state.applications.find(
          (application) =>
            application.campaign.id === campaignId &&
            application.role.slug === roleId &&
            application.email.toLowerCase() === email.toLowerCase() &&
            application.createdAt >= since
        ) ?? null
      );
    },
    async createApplication(input) {
      const application = {
        id: `application-${state.applications.length + 1}`,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        email: input.payload.email,
        fullName: input.payload.fullName,
        cvObjectKey: input.payload.cvObjectKey,
        campaign: input.campaign,
        role: input.campaign.role,
        createdAt: input.now,
        result: { applicationReference: input.reference }
      };
      state.applications.push(application);
      state.tokens.push(
        {
          application,
          hash: input.assessmentTokenHash,
          scope: "assessment",
          expiresAt: input.assessmentExpiresAt,
          used: false
        },
        {
          application,
          hash: input.recruiterTokenHash,
          scope: "recruiter_cv",
          expiresAt: input.recruiterTokenExpiresAt,
          used: false
        }
      );
      return application;
    },
    async consumeAccessToken({ tokenHash, scope, now }) {
      const token = state.tokens.find(
        (candidate) =>
          candidate.hash === tokenHash &&
          candidate.scope === scope &&
          !candidate.used &&
          candidate.expiresAt > now
      );
      if (!token) return null;
      token.used = true;
      return token.application;
    }
  };

  const storage = {
    async createSignedUploadUrl(input) {
      state.uploadRequests.push(input);
      return {
        objectKey: input.objectKey,
        uploadUrl: `https://project-ref.supabase.co/storage/v1/upload/sign/${input.objectKey}`,
        uploadToken: "signed-upload-token"
      };
    },
    async confirmObject(objectKey) {
      if (
        objectKey !== validPayload.cvObjectKey &&
        objectKey !== `${directCampaign.id}/upload-1/cv.pdf`
      ) {
        return null;
      }
      return {
        objectKey,
        contentType: validPayload.cvMimeType,
        size: validPayload.cvSize
      };
    },
    async createSignedDownloadUrl(objectKey, expiresIn) {
      state.downloadRequests.push({ objectKey, expiresIn });
      return `https://project-ref.supabase.co/storage/v1/object/sign/hiring-cvs/${objectKey}`;
    }
  };

  const email = {
    enqueueRecruiterApplication: vi.fn(async (input) => {
      state.recruiterEmails.push(input);
    })
  };

  let tokenSequence = 0;
  const service = createApplicationService({
    repository,
    storage,
    email,
    clock: { now: () => new Date(NOW) },
    tokenFactory: () => `opaque-token-${++tokenSequence}-with-enough-entropy`,
    assessmentTokenFactory,
    referenceFactory: () => `AUR-${state.applications.length + 1}`
  });

  return { campaign, directCampaign, email, repository, service, state, storage };
}

async function submit(service, overrides = {}) {
  return service.submitApplication({
    idempotencyKey: "submit-1",
    campaignToken: "campaign-token",
    roleSlug: "senior-ai-product-engineer",
    payload: validPayload,
    ...overrides
  });
}

async function submitDirect(service, directCampaign, overrides = {}) {
  return service.submitApplication({
    idempotencyKey: "direct-submit-1",
    roleSlug: directCampaign.role.slug,
    payload: {
      ...validPayload,
      cvObjectKey: `${directCampaign.id}/upload-1/cv.pdf`
    },
    ...overrides
  });
}

describe("application service", () => {
  test("hides why an invalid campaign is unavailable", async () => {
    const { service } = createFixture();

    await expect(
      service.validateCampaign({
        roleSlug: "senior-ai-product-engineer",
        campaignToken: "wrong-token"
      })
    ).rejects.toMatchObject({ code: "CAMPAIGN_UNAVAILABLE" });
  });

  test("lists the active roles for the single direct application link", async () => {
    const { service } = createFixture();

    await expect(service.listApplicationRoles()).resolves.toEqual([
      expect.objectContaining({
        slug: "senior-ai-product-engineer",
        title: "Senior AI Product Engineer"
      })
    ]);
  });

  test.each([
    ["image/png", 1024],
    ["application/pdf", MAX_CV_BYTES + 1]
  ])("rejects an invalid CV before signing upload: %s", async (mimeType, size) => {
    const { service, state } = createFixture();

    await expect(
      service.createUploadUrl({
        campaignId: "campaign-1",
        email: "nino@example.com",
        fileName: "cv.pdf",
        mimeType,
        size
      })
    ).rejects.toMatchObject({ code: "INVALID_CV" });
    expect(state.uploadRequests).toHaveLength(0);
  });

  test("stores one application and sends its details only to the recruiter", async () => {
    const { service, state } = createFixture();

    await expect(submit(service)).resolves.toEqual({
      applicationReference: "AUR-1"
    });
    expect(state.applications).toHaveLength(1);
    expect(state.recruiterEmails).toHaveLength(1);
    expect(state.recruiterEmails[0].to).toBe("auralis.careers@proton.me");
  });

  test("accepts a direct role selection without a campaign token", async () => {
    const { directCampaign, service, state } = createFixture();

    await expect(submitDirect(service, directCampaign)).resolves.toEqual({
      applicationReference: "AUR-1"
    });

    expect(state.applications[0].campaign).toMatchObject({
      id: "direct-campaign-1",
      label: "Direct application intake"
    });
    expect(state.recruiterEmails).toHaveLength(1);
    expect(state.tokens[0].expiresAt).toEqual(
      new Date("2026-07-24T12:00:00.000Z")
    );
  });

  test("uses the reproducible assessment token for storage and manual recruiter delivery", async () => {
    const assessmentTokenFactory = vi.fn(() => "stable-private-assessment-token");
    const { service, state } = createFixture({ assessmentTokenFactory });

    await submit(service);

    expect(assessmentTokenFactory).toHaveBeenCalledWith({
      idempotencyKey: "submit-1"
    });
    expect(state.recruiterEmails[0].assessmentToken).toBe(
      "stable-private-assessment-token"
    );
    expect(state.tokens[0].hash).toBe(hashToken("stable-private-assessment-token"));
  });

  test("reuses an idempotent submission without duplicate email", async () => {
    const { service, state } = createFixture();

    const first = await submit(service);
    const second = await submit(service);

    expect(second).toEqual(first);
    expect(state.applications).toHaveLength(1);
    expect(state.recruiterEmails).toHaveLength(1);
  });

  test("reuses the same normalized email, role, and campaign within 30 days", async () => {
    const { service, state } = createFixture();

    const first = await submit(service);
    const second = await submit(service, {
      idempotencyKey: "submit-2",
      payload: { ...validPayload, email: "  NINO@EXAMPLE.COM " }
    });

    expect(second).toEqual(first);
    expect(state.applications).toHaveLength(1);
    expect(state.recruiterEmails).toHaveLength(1);
  });

  test("emails the recruiter before assessment or payment completion", async () => {
    const { service, state } = createFixture();

    await submit(service);

    expect(state.applications[0]).not.toHaveProperty("assessmentScore");
    expect(state.applications[0]).not.toHaveProperty("paymentState");
    expect(state.recruiterEmails[0].application.reference).toBe("AUR-1");
  });

  test("exchanges a valid recruiter token once for a five-minute CV URL", async () => {
    const { service, state } = createFixture();
    await submit(service);
    const recruiterToken = state.recruiterEmails[0].recruiterToken;

    await expect(service.getRecruiterCv({ recruiterToken })).resolves.toMatchObject({
      expiresIn: 300,
      url: expect.stringContaining("project-ref.supabase.co")
    });
    expect(state.downloadRequests[0].expiresIn).toBe(300);

    await expect(service.getRecruiterCv({ recruiterToken })).rejects.toMatchObject({
      code: "CV_LINK_INVALID"
    });
    await expect(
      service.getRecruiterCv({ recruiterToken: "unknown-token" })
    ).rejects.toMatchObject({ code: "CV_LINK_INVALID" });
  });
});
