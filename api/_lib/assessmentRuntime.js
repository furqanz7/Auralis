import {
  createAssessmentOrderer,
  createAssessmentService,
  createVerificationTokenFactory
} from "./assessmentService.js";
import { readAssessmentEnv } from "./env.js";
import {
  createSupabaseAssessmentRepository,
  getSupabaseAdmin
} from "./adapters/supabase.js";
import { createHiringEmailAdapter } from "./adapters/hiringEmail.js";
import { createAssessmentTokenFactory } from "./tokens.js";
import { getTestHiringRuntime } from "./testHiringRuntime.js";
import { createLiveEmailClient } from "./liveEmailClient.js";

export function createAssessmentRuntime({ env, client, emailClient }) {
  return createAssessmentService({
    repository: createSupabaseAssessmentRepository({ client }),
    email: createHiringEmailAdapter({
      emailClient,
      from: env.RESEND_FROM,
      recruiterEmail: env.HIRING_RECRUITER_EMAIL,
      siteUrl: env.PUBLIC_SITE_URL
    }),
    orderer: createAssessmentOrderer(env.HIRING_TOKEN_SECRET),
    verificationTokenFactory: createVerificationTokenFactory(
      env.HIRING_TOKEN_SECRET
    ),
    reminderTokenFactory: createAssessmentTokenFactory(
      env.HIRING_TOKEN_SECRET
    )
  });
}

let runtimeService;

export function getAssessmentRuntimeService() {
  if (!runtimeService) {
    const env = readAssessmentEnv();
    runtimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).assessment
        : createAssessmentRuntime({
            env,
            client: getSupabaseAdmin(),
            emailClient: createLiveEmailClient(env)
          });
  }
  return runtimeService;
}
