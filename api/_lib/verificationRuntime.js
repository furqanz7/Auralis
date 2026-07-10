import { createHiringEmailAdapter } from "./adapters/hiringEmail.js";
import {
  createSupabaseVerificationRepository,
  getSupabaseAdmin
} from "./adapters/supabase.js";
import { createPaymentAdapter } from "./adapters/tbcPayment.js";
import {
  readAssessmentEnv,
  readVerificationEnv,
  readWisePaymentUrl
} from "./env.js";
import { createVerificationReturnTokenFactory } from "./tokens.js";
import {
  createVerificationService,
  createVerificationStatusService
} from "./verificationService.js";
import { getTestHiringRuntime } from "./testHiringRuntime.js";
import { createLiveEmailClient } from "./liveEmailClient.js";

export function createVerificationRuntime({
  env,
  client,
  emailClient,
  fetchImpl = fetch
}) {
  return createVerificationService({
    repository: createSupabaseVerificationRepository({ client }),
    payment: createPaymentAdapter({
      fetchImpl,
      apiKey: env.TBC_API_KEY,
      clientId: env.TBC_CLIENT_ID,
      clientSecret: env.TBC_CLIENT_SECRET,
      baseUrl: env.TBC_BASE_URL,
      checkoutHost: env.TBC_CHECKOUT_HOST
    }),
    email: createHiringEmailAdapter({
      emailClient,
      from: env.RESEND_FROM,
      recruiterEmail: env.HIRING_RECRUITER_EMAIL,
      siteUrl: env.PUBLIC_SITE_URL
    }),
    returnTokenFactory: createVerificationReturnTokenFactory(
      env.HIRING_TOKEN_SECRET
    )
  });
}

export function createVerificationStatusRuntime({ client, wisePaymentUrl }) {
  return createVerificationStatusService({
    repository: createSupabaseVerificationRepository({ client }),
    checkoutAvailable: Boolean(wisePaymentUrl),
    payment: wisePaymentUrl
      ? {
          provider: "wise",
          mode: "manual",
          url: wisePaymentUrl
        }
      : null
  });
}

let runtimeService;
let statusRuntimeService;

export function getVerificationRuntimeService() {
  if (!runtimeService) {
    const env = readVerificationEnv();
    runtimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).verification
        : createVerificationRuntime({
            env,
            client: getSupabaseAdmin(),
            emailClient: createLiveEmailClient(env)
          });
  }
  return runtimeService;
}

export function getVerificationStatusRuntimeService() {
  if (!statusRuntimeService) {
    const env = readAssessmentEnv();
    statusRuntimeService =
      env.HIRING_PROVIDER_MODE === "test"
        ? getTestHiringRuntime(env).verification
        : createVerificationStatusRuntime({
            client: getSupabaseAdmin(),
            wisePaymentUrl: readWisePaymentUrl()
          });
  }
  return statusRuntimeService;
}
