import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260711103927_wise_payment_reports.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

const restrictedRpcs = [
  "create_hiring_wise_payment_report(text, text, timestamptz)",
  "claim_hiring_wise_payment_report_notification(uuid, timestamptz)",
  "mark_hiring_wise_payment_report_sent(uuid, integer, timestamptz)",
  "mark_hiring_wise_payment_report_failed(uuid, integer, text, timestamptz)"
];

describe("Wise payment report migration", () => {
  test("stores one private fixed-value report per application", async () => {
    const sql = await migration();

    expect(sql).toContain("create table public.hiring_wise_payment_reports");
    expect(sql).toContain("application_id uuid not null unique");
    expect(sql).toContain("check (amount_minor = 299)");
    expect(sql).toContain("check (currency = 'eur')");
    expect(sql).toContain("on delete cascade");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).toMatch(/payer_name[\s\S]*char_length\(payer_name\) between 2 and 120/);
    expect(sql).toContain("notification_attempt_count between 0 and 100");
    expect(sql).toContain("'notification_in_progress'");
    expect(sql).toContain("'email_delivery_failed'");
    expect(sql).toContain("hiring_set_updated_at()");
  });

  test("preserves verification payloads and always adds the payment report sibling", async () => {
    const sql = await migration();

    expect(sql).toContain("hiring_wise_payment_report_payload");
    expect(sql).toContain("get_hiring_verification_by_token");
    expect(sql).toContain("hiring_verification_payload(v_verification_id)");
    expect(sql).toContain("jsonb_build_object('payment_report'");
    expect(sql).toContain("'payment_report', null");
  });

  test("validates an active verification token and assessment-submitted lifecycle", async () => {
    const sql = await migration();

    expect(sql).toContain("access_token.token_hash = p_token_hash::char(64)");
    expect(sql).toContain("access_token.scope = 'verification'");
    expect(sql).toContain("access_token.expires_at > p_now");
    expect(sql).toContain("access_token.revoked_at is null");
    expect(sql).toContain("application.lifecycle_state = 'assessment_submitted'");
    expect(sql).toContain("for update of application");
    expect(sql).not.toMatch(
      /update\s+public\.hiring_applications[\s\S]*lifecycle_state/i
    );
  });

  test("atomically claims bounded retries and reclaims stale leases", async () => {
    const sql = await migration();

    expect(sql).toContain("for update");
    expect(sql).toContain("notification_attempt_count < 100");
    expect(sql).toContain("last_notification_error = 'email_delivery_failed'");
    expect(sql).toContain("last_notification_error = 'notification_in_progress'");
    expect(sql).toContain("p_now - interval '5 minutes'");
    expect(sql).toContain("notification_claimed_at <= p_now - interval '5 minutes'");
    expect(sql).toContain("notification_attempt_count = p_attempt_number");
  });

  test("allows only service-role table and function access", async () => {
    const sql = await migration();

    expect(sql).toMatch(
      /revoke all on table public\.hiring_wise_payment_reports from anon, authenticated/
    );
    expect(sql).toMatch(
      /grant (select, insert, update|all) on table public\.hiring_wise_payment_reports\s+to service_role/
    );
    expect(sql).toMatch(
      /revoke all on all sequences in schema public from anon, authenticated/
    );

    for (const signature of restrictedRpcs) {
      const escaped = signature.replace(/[()]/g, "\\$&");
      expect(sql).toMatch(
        new RegExp(
          `revoke (?:all|execute) on function public\\.${escaped}\\s+from public, anon, authenticated`
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${escaped}\\s+to service_role`
        )
      );
    }
  });
});
