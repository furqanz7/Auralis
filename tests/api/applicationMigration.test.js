import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607100001_hiring_application.sql"
);

async function readMigration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("hiring application migration", () => {
  test("creates all private application tables with row-level security", async () => {
    const sql = await readMigration();
    const tables = [
      "hiring_roles",
      "hiring_campaigns",
      "hiring_applications",
      "hiring_email_events",
      "hiring_access_tokens"
    ];

    for (const table of tables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`
      );
    }

    expect(sql).not.toMatch(/create\s+policy/i);
  });

  test("enforces application idempotency and 180-day deletion", async () => {
    const sql = await readMigration();

    expect(sql).toMatch(/idempotency_key[\s\S]*unique/);
    expect(sql).toContain("deletion_due_at");
    expect(sql).toContain("interval '180 days'");
  });

  test("indexes lifecycle, campaign, role, normalized email, and deletion", async () => {
    const sql = await readMigration();

    expect(sql).toContain("hiring_applications_lifecycle_idx");
    expect(sql).toContain("hiring_applications_deletion_idx");
    expect(sql).toContain("hiring_applications_campaign_idx");
    expect(sql).toContain("hiring_applications_role_idx");
    expect(sql).toContain("hiring_applications_email_idx");
  });

  test("uses service-role-only invoker functions for atomic application writes", async () => {
    const sql = await readMigration();

    expect(sql).toContain("function public.create_hiring_application");
    expect(sql).toContain("function public.consume_hiring_access_token");
    expect(sql).toContain("security invoker");
    expect(sql).toMatch(/revoke all on function public\.create_hiring_application/);
    expect(sql).toMatch(/grant execute on function public\.create_hiring_application/);
  });
});
