import { createHiringEmailAdapter } from "./adapters/hiringEmail.js";
import {
  createSupabaseWisePaymentReportRepository,
  getSupabaseAdmin
} from "./adapters/supabase.js";
import { readAssessmentEnv } from "./env.js";
import { getTestHiringRuntime } from "./testHiringRuntime.js";
import { createLiveEmailClient } from "./liveEmailClient.js";
import { createWisePaymentReportService } from "./wisePaymentReportService.js";

export function createWisePaymentReportRuntime({ env, client, emailClient }) {
  return createWisePaymentReportService({
    repository: createSupabaseWisePaymentReportRepository({ client }),
    email: createHiringEmailAdapter({
      emailClient,
      from: env.RESEND_FROM,
      recruiterEmail: env.HIRING_RECRUITER_EMAIL,
      siteUrl: env.PUBLIC_SITE_URL
    })
  });
}

let runtimeService;

export function getWisePaymentReportRuntimeService() {
  if (!runtimeService) {
    const env = readAssessmentEnv();
    runtimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).wisePaymentReport
        : createWisePaymentReportRuntime({
            env,
            client: getSupabaseAdmin(),
            emailClient: createLiveEmailClient(env)
          });
  }
  return runtimeService;
}
