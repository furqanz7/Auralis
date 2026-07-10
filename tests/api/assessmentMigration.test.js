import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607100002_hiring_assessment.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("hiring assessment migration", () => {
  test("creates private sessions and unique question responses", async () => {
    const sql = await migration();

    expect(sql).toContain("create table public.hiring_assessment_sessions");
    expect(sql).toContain("create table public.hiring_assessment_responses");
    expect(sql).toContain("unique (application_id)");
    expect(sql).toContain("unique (session_id, question_id)");
    expect(sql).toContain(
      "alter table public.hiring_assessment_sessions enable row level security"
    );
    expect(sql).toContain(
      "alter table public.hiring_assessment_responses enable row level security"
    );
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  test("stores authoritative timing, snapshot, scoring, and lock state", async () => {
    const sql = await migration();

    for (const column of [
      "question_snapshot",
      "invitation_expires_at",
      "started_at",
      "deadline_at",
      "submitted_at",
      "raw_score",
      "dimension_scores",
      "response_version",
      "locked"
    ]) {
      expect(sql).toContain(column);
    }
  });
});
