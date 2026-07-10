import { describe, expect, test } from "vitest";
import { ROLE_CONFIG, getRoleBySlug } from "../../shared/hiring/roles.js";

describe("ROLE_CONFIG", () => {
  test("contains six unique senior contractor roles", () => {
    expect(ROLE_CONFIG).toHaveLength(6);
    expect(new Set(ROLE_CONFIG.map((role) => role.slug)).size).toBe(6);
    expect(ROLE_CONFIG.every((role) => role.title.startsWith("Senior"))).toBe(true);
    expect(
      ROLE_CONFIG.every(
        (role) =>
          role.engagement === "Independent contractor" &&
          role.location === "Remote worldwide"
      )
    ).toBe(true);
  });

  test("exposes the approved AI role band", () => {
    expect(getRoleBySlug("senior-ai-product-engineer")).toMatchObject({
      rateMin: 85,
      rateMax: 120,
      currency: "EUR"
    });
  });

  test("marks portfolios as required only for visual and frontend roles", () => {
    const requiredSlugs = ROLE_CONFIG.filter((role) => role.portfolioRequired).map(
      (role) => role.slug
    );

    expect(requiredSlugs).toEqual([
      "senior-creative-frontend-developer",
      "senior-product-designer",
      "senior-brand-visual-systems-designer"
    ]);
  });

  test("returns null for an unknown role", () => {
    expect(getRoleBySlug("unknown-role")).toBeNull();
  });
});
