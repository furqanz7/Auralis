import { describe, expect, test } from "vitest";
import {
  readAssessmentEnv,
  readCronEnv,
  readServerEnv,
  readVerificationEnv
} from "../../api/_lib/env.js";

const validEnv = {
  PUBLIC_SITE_URL: "https://auralis.studio",
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  SUPABASE_CV_BUCKET: "hiring-cvs",
  GMAIL_SMTP_USER: "auralis.careers@gmail.com",
  GMAIL_SMTP_APP_PASSWORD: "sixteen-character-app-password",
  HIRING_EMAIL_FROM: "Auralis Careers <auralis.careers@gmail.com>",
  HIRING_RECRUITER_EMAIL: "auralis.careers@proton.me",
  TURNSTILE_SECRET_KEY: "turnstile-secret"
};

describe("readServerEnv", () => {
  test("accepts the Phase 1 server configuration", () => {
    expect(readServerEnv(validEnv)).toMatchObject(validEnv);
  });

  test("fails closed when a service secret is absent", () => {
    expect(() =>
      readServerEnv({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: "" })
    ).toThrow(/server environment/i);
  });

  test("requires a dedicated assessment HMAC secret", () => {
    expect(
      readAssessmentEnv({
        ...validEnv,
        HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
      })
    ).toMatchObject({
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
    });
    expect(() =>
      readAssessmentEnv({ ...validEnv, HIRING_TOKEN_SECRET: "short" })
    ).toThrow(/server environment/i);
  });

  test("requires a dedicated cron authorization secret", () => {
    const assessmentEnv = {
      ...validEnv,
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
    };

    expect(
      readCronEnv({
        ...assessmentEnv,
        CRON_SECRET: "cron-secret-with-at-least-32-characters"
      })
    ).toMatchObject({
      CRON_SECRET: "cron-secret-with-at-least-32-characters"
    });
    expect(() => readCronEnv(assessmentEnv)).toThrow(/server environment/i);
  });

  test("requires the complete hosted TBC provider configuration", () => {
    const verificationEnv = {
      ...validEnv,
      HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters",
      TBC_BASE_URL: "https://api.tbcbank.ge",
      TBC_CHECKOUT_HOST: "tpay.tbcbank.ge",
      TBC_API_KEY: "developer-api-key",
      TBC_CLIENT_ID: "merchant-client-id",
      TBC_CLIENT_SECRET: "merchant-client-secret"
    };

    expect(readVerificationEnv(verificationEnv)).toMatchObject({
      TBC_BASE_URL: "https://api.tbcbank.ge",
      TBC_CHECKOUT_HOST: "tpay.tbcbank.ge"
    });
    expect(() =>
      readVerificationEnv({ ...verificationEnv, TBC_CLIENT_SECRET: "" })
    ).toThrow(/server environment/i);
  });

  test("allows deterministic providers locally without live service secrets", () => {
    expect(
      readAssessmentEnv({
        PUBLIC_SITE_URL: "https://auralis.test",
        HIRING_PROVIDER_MODE: "test",
        HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
      })
    ).toMatchObject({
      HIRING_PROVIDER_MODE: "test",
      PUBLIC_SITE_URL: "https://auralis.test"
    });
  });

  test("makes deterministic providers impossible in production", () => {
    expect(() =>
      readAssessmentEnv({
        PUBLIC_SITE_URL: "https://auralis.studio",
        HIRING_PROVIDER_MODE: "test",
        VERCEL_ENV: "production",
        HIRING_TOKEN_SECRET: "assessment-secret-with-at-least-32-characters"
      })
    ).toThrow(/live mode/i);
  });
});
