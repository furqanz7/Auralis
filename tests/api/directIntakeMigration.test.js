import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260710152550_direct_hiring_intake.sql"
);

describe("direct hiring intake migration", () => {
  test("creates one service-role-only direct intake source for each active role", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    expect(sql).toContain("add column if not exists direct_application");
    expect(sql).toContain("hiring_campaigns_direct_application_role_idx");
    expect(sql).toContain("function public.get_direct_hiring_campaign");
    expect(sql).toContain("security invoker");
    expect(sql).toMatch(/revoke all on function public\.get_direct_hiring_campaign/);
    expect(sql).toMatch(/grant execute on function public\.get_direct_hiring_campaign/);
    expect(sql).toContain("where direct_application");
  });
});
