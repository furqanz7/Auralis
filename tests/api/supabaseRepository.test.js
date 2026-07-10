import { describe, expect, test, vi } from "vitest";
import { createSupabaseApplicationRepository } from "../../api/_lib/adapters/supabase.js";

const campaignRow = {
  id: "campaign-id",
  label: "Instagram / AI product",
  expires_at: "2026-08-01T00:00:00.000Z",
  role_id: "role-id",
  role_slug: "senior-ai-product-engineer",
  role_title: "Senior AI Product Engineer",
  rate_min: 85,
  rate_max: 120,
  currency: "EUR",
  engagement: "Independent contractor",
  location: "Remote worldwide",
  portfolio_required: false
};

function createFixture(results = {}) {
  const rpc = vi.fn(async (name) => ({
    data: results[name] ?? [],
    error: null
  }));
  return {
    repository: createSupabaseApplicationRepository({ client: { rpc } }),
    rpc
  };
}

describe("Supabase application repository", () => {
  test("normalizes active campaign RPC rows", async () => {
    const { repository } = createFixture({
      get_active_hiring_campaign: [campaignRow]
    });

    await expect(
      repository.findCampaign({
        roleSlug: "senior-ai-product-engineer",
        tokenHash: "a".repeat(64),
        now: new Date("2026-07-10T12:00:00.000Z")
      })
    ).resolves.toMatchObject({
      id: "campaign-id",
      role: {
        id: "role-id",
        slug: "senior-ai-product-engineer",
        rateMin: 85,
        rateMax: 120
      }
    });
  });

  test("returns null for missing idempotent and recent applications", async () => {
    const { repository } = createFixture();

    await expect(repository.findByIdempotencyKey("submission-1")).resolves.toBeNull();
    await expect(
      repository.findRecentApplication({
        campaignId: "campaign-id",
        roleId: "role-id",
        email: "nino@example.com",
        since: new Date("2026-06-10T12:00:00.000Z")
      })
    ).resolves.toBeNull();
  });

  test("creates the application and both access tokens atomically", async () => {
    const applicationRow = {
      id: "application-id",
      reference: "AUR-1",
      full_name: "Nino Beridze",
      email: "nino@example.com",
      cv_object_key: "campaign/upload/cv.pdf",
      created_at: "2026-07-10T12:00:00.000Z"
    };
    const { repository, rpc } = createFixture({
      create_hiring_application: [applicationRow]
    });
    const campaign = {
      id: "campaign-id",
      label: "Instagram / AI product",
      role: { id: "role-id", slug: "senior-ai-product-engineer" }
    };

    await expect(
      repository.createApplication({
        campaign,
        idempotencyKey: "submission-1",
        payload: {
          fullName: "Nino Beridze",
          email: "nino@example.com",
          country: "Georgia",
          timeZone: "Asia/Tbilisi",
          profileUrl: "https://linkedin.com/in/nino",
          availability: "20-30 hours",
          cvObjectKey: "campaign/upload/cv.pdf",
          cvMimeType: "application/pdf",
          cvSize: 2048
        },
        reference: "AUR-1",
        assessmentTokenHash: "a".repeat(64),
        assessmentExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
        recruiterTokenHash: "b".repeat(64),
        recruiterTokenExpiresAt: new Date("2026-08-09T12:00:00.000Z"),
        now: new Date("2026-07-10T12:00:00.000Z")
      })
    ).resolves.toMatchObject({
      id: "application-id",
      reference: "AUR-1",
      campaign,
      role: campaign.role
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_hiring_application",
      expect.objectContaining({
        p_assessment_token_hash: "a".repeat(64),
        p_recruiter_token_hash: "b".repeat(64)
      })
    );
  });

  test("atomically consumes a scoped access token", async () => {
    const { repository, rpc } = createFixture({
      consume_hiring_access_token: [
        {
          id: "application-id",
          reference: "AUR-1",
          cv_object_key: "campaign/upload/cv.pdf"
        }
      ]
    });

    await expect(
      repository.consumeAccessToken({
        tokenHash: "a".repeat(64),
        scope: "recruiter_cv",
        now: new Date("2026-07-10T12:00:00.000Z")
      })
    ).resolves.toMatchObject({
      id: "application-id",
      cvObjectKey: "campaign/upload/cv.pdf"
    });
    expect(rpc).toHaveBeenCalledWith(
      "consume_hiring_access_token",
      expect.objectContaining({ p_scope: "recruiter_cv" })
    );
  });
});
