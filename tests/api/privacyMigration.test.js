import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607100005_hiring_privacy.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("hiring privacy migration", () => {
  test("persists bounded deletion claims and retries", async () => {
    const sql = await migration();

    for (const column of [
      "deletion_claimed_at",
      "deletion_attempt_count",
      "deletion_next_attempt_at",
      "deletion_last_error_category"
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("deletion_due_at <= p_now");
    expect(sql).toContain("for update skip locked");
  });

  test("retains only anonymous role-month counts after cascaded PII deletion", async () => {
    const sql = await migration();

    expect(sql).toContain("create table public.hiring_anonymous_application_counts");
    expect(sql).toContain("role_slug");
    expect(sql).toContain("submitted_month");
    expect(sql).toContain("delete from public.hiring_applications");
    expect(sql).not.toContain("candidate_email");
    expect(sql).not.toContain("full_name text");
  });

  test("issues scoped, expiring confirmation tokens without public access", async () => {
    const sql = await migration();

    expect(sql).toContain("create_hiring_deletion_request");
    expect(sql).toContain("'privacy_deletion'");
    expect(sql).toContain("claim_hiring_deletion_by_token");
    expect(sql).toMatch(/revoke all on function public\.create_hiring_deletion_request/i);
    expect(sql).toMatch(/grant execute on function public\.create_hiring_deletion_request/i);
    expect(sql).toContain(
      "deletion_due_at = least(application.deletion_due_at, p_now)"
    );
  });
});
