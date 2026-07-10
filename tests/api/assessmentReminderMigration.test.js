import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607100003_hiring_assessment_reminders.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("assessment reminder migration", () => {
  test("persists bounded reminder attempts and provider delivery state", async () => {
    const sql = await migration();

    for (const column of [
      "reminder_attempt_count",
      "reminder_last_attempt_at",
      "reminder_next_attempt_at",
      "reminder_provider_message_id",
      "reminder_last_error_code"
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("reminder_attempt_count < 5");
  });

  test("atomically claims only due, unstarted, unexpired sessions", async () => {
    const sql = await migration();

    expect(sql).toContain("claim_hiring_assessment_reminders");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("invitation_issued_at <= p_now - interval '24 hours'");
    expect(sql).toContain("invitation_expires_at > p_now");
    expect(sql).toContain("started_at is null");
    expect(sql).toContain("submitted_at is null");
    expect(sql).toContain("reminder_sent_at is null");
    expect(sql).toContain("application.idempotency_key");
  });

  test("restricts claim and result functions to the service role", async () => {
    const sql = await migration();

    expect(sql).toContain("record_hiring_assessment_reminder");
    expect(sql).toMatch(/revoke all on function public\.claim_hiring_assessment_reminders/i);
    expect(sql).toMatch(/grant execute on function public\.claim_hiring_assessment_reminders/i);
    expect(sql).toMatch(/revoke all on function public\.record_hiring_assessment_reminder/i);
    expect(sql).toMatch(/grant execute on function public\.record_hiring_assessment_reminder/i);
  });
});
