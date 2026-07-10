import { createHiringEmailAdapter } from "./adapters/hiringEmail.js";
import {
  createSupabaseHiringStorage,
  createSupabasePrivacyRepository,
  getSupabaseAdmin
} from "./adapters/supabase.js";
import { readServerEnv } from "./env.js";
import { createHiringPrivacyService } from "./privacyService.js";
import { createOpaqueToken } from "./tokens.js";
import { getTestHiringRuntime } from "./testHiringRuntime.js";
import { createLiveEmailClient } from "./liveEmailClient.js";

export function createPrivacyRuntime({ env, client, emailClient }) {
  return createHiringPrivacyService({
    repository: createSupabasePrivacyRepository({ client }),
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
    tokenFactory: () => createOpaqueToken(32)
  });
}

let runtimeService;

export function getPrivacyRuntimeService() {
  if (!runtimeService) {
    const env = readServerEnv();
    runtimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).privacy
        : createPrivacyRuntime({
            env,
            client: getSupabaseAdmin(),
            emailClient: createLiveEmailClient(env)
          });
  }
  return runtimeService;
}
