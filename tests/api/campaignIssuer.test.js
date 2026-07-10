import { describe, expect, test } from "vitest";
import { hashToken } from "../../api/_lib/tokens.js";
import { createPrivateCampaign } from "../../scripts/create-hiring-campaign.mjs";

describe("private campaign issuer", () => {
  test("returns one private URL while storing only the token hash", () => {
    const issued = createPrivateCampaign({
      roleSlug: "senior-ai-product-engineer",
      label: "Instagram / July 2026",
      days: 14,
      siteUrl: "https://auralis.studio",
      now: new Date("2026-07-10T12:00:00.000Z"),
      tokenFactory: () => "private-campaign-token-with-enough-entropy"
    });

    expect(issued.privateUrl).toBe(
      "https://auralis.studio/apply/senior-ai-product-engineer/private-campaign-token-with-enough-entropy"
    );
    expect(issued.record).toEqual({
      label: "Instagram / July 2026",
      token_hash: hashToken("private-campaign-token-with-enough-entropy"),
      active_at: "2026-07-10T12:00:00.000Z",
      expires_at: "2026-07-24T12:00:00.000Z"
    });
    expect(JSON.stringify(issued.record)).not.toContain(
      "private-campaign-token-with-enough-entropy"
    );
  });

  test("rejects unknown roles and unbounded campaign durations", () => {
    expect(() =>
      createPrivateCampaign({
        roleSlug: "unknown-role",
        label: "Instagram",
        days: 14,
        siteUrl: "https://auralis.studio"
      })
    ).toThrow(/role/i);
    expect(() =>
      createPrivateCampaign({
        roleSlug: "senior-ai-product-engineer",
        label: "Instagram",
        days: 365,
        siteUrl: "https://auralis.studio"
      })
    ).toThrow(/days/i);
  });
});
