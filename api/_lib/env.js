import { z } from "zod";

const providerSchema = z.object({
  PUBLIC_SITE_URL: z.string().url(),
  HIRING_PROVIDER_MODE: z.enum(["test", "live"]).default("live"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional()
});

const livePhaseOneServerEnvSchema = providerSchema.extend({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_CV_BUCKET: z.string().min(1).default("hiring-cvs"),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),
  HIRING_RECRUITER_EMAIL: z.string().email(),
  TURNSTILE_SECRET_KEY: z.string().min(1)
});

const testPhaseOneServerEnvSchema = providerSchema.extend({
  HIRING_PROVIDER_MODE: z.literal("test"),
  HIRING_TOKEN_SECRET: z.string().min(32).optional()
});

const liveAssessmentServerEnvSchema = livePhaseOneServerEnvSchema.extend({
  HIRING_TOKEN_SECRET: z.string().min(32)
});

const testAssessmentServerEnvSchema = testPhaseOneServerEnvSchema.extend({
  HIRING_TOKEN_SECRET: z.string().min(32)
});

const liveCronServerEnvSchema = liveAssessmentServerEnvSchema.extend({
  CRON_SECRET: z.string().min(32)
});

const testCronServerEnvSchema = testAssessmentServerEnvSchema.extend({
  CRON_SECRET: z.string().min(32)
});

const liveVerificationServerEnvSchema = liveAssessmentServerEnvSchema.extend({
  TBC_BASE_URL: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:"),
  TBC_CHECKOUT_HOST: z.string().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/),
  TBC_API_KEY: z.string().min(1),
  TBC_CLIENT_ID: z.string().min(1),
  TBC_CLIENT_SECRET: z.string().min(1)
});

const testVerificationServerEnvSchema = testAssessmentServerEnvSchema;

function parseServerEnv(schema, source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Invalid server environment: ${fields || "unknown field"}.`);
  }

  return result.data;
}

function readProviderMode(source) {
  const mode = source.HIRING_PROVIDER_MODE ?? "live";
  if (source.VERCEL_ENV === "production" && mode !== "live") {
    throw new Error("Production hiring providers must run in live mode.");
  }
  return mode;
}

function parseProviderEnv(liveSchema, testSchema, source) {
  return parseServerEnv(
    readProviderMode(source) === "test" ? testSchema : liveSchema,
    source
  );
}

export function readServerEnv(source = process.env) {
  return parseProviderEnv(
    livePhaseOneServerEnvSchema,
    testPhaseOneServerEnvSchema,
    source
  );
}

export function readAssessmentEnv(source = process.env) {
  return parseProviderEnv(
    liveAssessmentServerEnvSchema,
    testAssessmentServerEnvSchema,
    source
  );
}

export function readCronEnv(source = process.env) {
  return parseProviderEnv(
    liveCronServerEnvSchema,
    testCronServerEnvSchema,
    source
  );
}

export function readVerificationEnv(source = process.env) {
  return parseProviderEnv(
    liveVerificationServerEnvSchema,
    testVerificationServerEnvSchema,
    source
  );
}
