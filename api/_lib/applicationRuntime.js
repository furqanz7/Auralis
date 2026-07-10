import { createApplicationService } from "./applicationService.js";
import { readAssessmentEnv } from "./env.js";
import { createAssessmentTokenFactory } from "./tokens.js";
import {
  createSupabaseApplicationRepository,
  createSupabaseHiringStorage,
  getSupabaseAdmin
} from "./adapters/supabase.js";
import { createHiringEmailAdapter } from "./adapters/hiringEmail.js";
import { createTurnstileAdapter } from "./adapters/turnstile.js";
import { createLiveEmailClient } from "./liveEmailClient.js";
import { getTestHiringRuntime } from "./testHiringRuntime.js";

export function createApplicationRuntime({
  env,
  client,
  emailClient,
  fetchImpl = fetch
}) {
  return createApplicationService({
    repository: createSupabaseApplicationRepository({ client }),
    storage: createSupabaseHiringStorage({
      client,
      bucket: env.SUPABASE_CV_BUCKET
    }),
    email: createHiringEmailAdapter({
      emailClient,
      from: env.RESEND_FROM,
      recruiterEmail: env.HIRING_RECRUITER_EMAIL,
      siteUrl: env.PUBLIC_SITE_URL
    }),
    recruiterEmail: env.HIRING_RECRUITER_EMAIL,
    assessmentTokenFactory: createAssessmentTokenFactory(
      env.HIRING_TOKEN_SECRET
    ),
    turnstile: createTurnstileAdapter({
      fetchImpl,
      secretKey: env.TURNSTILE_SECRET_KEY,
      expectedHostname: new URL(env.PUBLIC_SITE_URL).hostname,
      expectedAction: "hiring_application"
    })
  });
}

let runtimeService;

export function getApplicationRuntimeService() {
  if (!runtimeService) {
    const env = readAssessmentEnv();
    runtimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).application
        : createApplicationRuntime({
            env,
            client: getSupabaseAdmin(),
            emailClient: createLiveEmailClient(env)
          });
  }

  return runtimeService;
}
