import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("hiring production readiness", () => {
  test("documents every runtime variable without committing secrets", async () => {
    const source = await readFile(resolve(root, ".env.example"), "utf8");
    const names = new Set(
      source
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split("=")[0])
    );
    for (const name of [
      "PUBLIC_SITE_URL",
      "HIRING_PROVIDER_MODE",
      "HIRING_TOKEN_SECRET",
      "HIRING_IP_HASH_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_CV_BUCKET",
      "RESEND_API_KEY",
      "RESEND_FROM",
      "HIRING_RECRUITER_EMAIL",
      "VITE_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "VITE_TBC_CHECKOUT_HOST",
      "TBC_BASE_URL",
      "TBC_CHECKOUT_HOST",
      "TBC_API_KEY",
      "TBC_CLIENT_ID",
      "TBC_CLIENT_SECRET",
      "CRON_SECRET"
    ]) {
      expect(names.has(name), `${name} is missing`).toBe(true);
    }
    for (const secret of [
      "HIRING_TOKEN_SECRET",
      "HIRING_IP_HASH_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RESEND_API_KEY",
      "TURNSTILE_SECRET_KEY",
      "TBC_API_KEY",
      "TBC_CLIENT_ID",
      "TBC_CLIENT_SECRET",
      "CRON_SECRET"
    ]) {
      expect(source).toMatch(new RegExp(`^${secret}=$`, "m"));
    }
  });

  test("keeps local environment files out of source control", async () => {
    const source = await readFile(resolve(root, ".gitignore"), "utf8");
    expect(source).toContain(".env*");
    expect(source).toContain("!.env.example");
  });

  test("provides an explicit production launch checklist", async () => {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    for (const phrase of [
      "Supabase migrations",
      "Resend Internal Delivery",
      "Cloudflare Turnstile",
      "TBC merchant",
      "preauthorization",
      "/api/payments/tbc/callback",
      "Vercel Cron",
      "Auralis, Tbilisi, Georgia",
      "HIRING_PROVIDER_MODE=live",
      "npm run hiring:campaign"
    ]) {
      expect(readme).toContain(phrase);
    }
  });
});
