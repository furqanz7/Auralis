import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260710085247_harden_hiring_runtime.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("hiring runtime hardening migration", () => {
  test("removes ambiguous verification identifiers", async () => {
    const sql = await migration();

    expect(sql).toContain("v_application_id uuid");
    expect(sql).toContain("verification.application_id = v_application_id");
    expect(sql).toContain("application.id = v_application_id");
    expect(sql).not.toMatch(/verification\.application_id\s*=\s*application_id/);
  });

  test("preserves private runtime access", async () => {
    const sql = await migration();

    expect(sql).toMatch(
      /revoke all on function public\.get_hiring_verification_by_token[\s\S]*from public, anon, authenticated/
    );
    expect(sql).toMatch(
      /grant execute on function public\.get_hiring_verification_by_token[\s\S]*to service_role/
    );
    expect(sql).toMatch(
      /revoke execute on function public\.rls_auto_enable\(\)[\s\S]*from public, anon, authenticated/
    );
  });

  test("indexes access-token application relationships", async () => {
    const sql = await migration();

    expect(sql).toMatch(
      /create index if not exists hiring_access_tokens_application_idx[\s\S]*hiring_access_tokens \(application_id\)/
    );
  });
});
