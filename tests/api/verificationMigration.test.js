import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202607100004_hiring_verification.sql"
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).toLowerCase();
}

describe("hiring verification migration", () => {
  test("stores one private fixed-value verification per application", async () => {
    const sql = await migration();

    expect(sql).toContain("create table public.hiring_payment_verifications");
    expect(sql).toContain("application_id uuid not null unique");
    expect(sql).toContain("amount_minor integer not null default 299");
    expect(sql).toContain("check (amount_minor = 299)");
    expect(sql).toContain("check (currency = 'eur')");
    expect(sql).toContain("check (pre_auth = true)");
    expect(sql).toContain(
      "alter table public.hiring_payment_verifications enable row level security"
    );
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  test("persists hosted handoff, callback, cancellation, retry, and redacted failure state", async () => {
    const sql = await migration();

    for (const column of [
      "merchant_reference",
      "provider_payment_id",
      "approval_url",
      "return_token_hash",
      "provider_state",
      "cancellation_state",
      "cancellation_attempt_count",
      "next_retry_at",
      "callback_received_at",
      "completed_at",
      "error_category"
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).not.toContain("card_number");
    expect(sql).not.toContain("cardholder");
    expect(sql).not.toContain("cvv");
  });

  test("exposes only service-role state transitions and atomic retry claims", async () => {
    const sql = await migration();

    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("get_hiring_verification_by_token");
    expect(sql).toContain("reserve_hiring_payment_verification");
    expect(sql).toContain("claim_hiring_verification_retries");
    expect(sql).toMatch(/revoke all on function public\.get_hiring_verification_by_token/i);
    expect(sql).toMatch(/grant execute on function public\.get_hiring_verification_by_token/i);
  });
});
