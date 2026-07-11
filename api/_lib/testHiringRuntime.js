import { createApplicationService } from "./applicationService.js";
import {
  createAssessmentOrderer,
  createAssessmentService,
  createVerificationTokenFactory
} from "./assessmentService.js";
import { createTestHiringProviders } from "./adapters/testProviders.js";
import { createHiringPrivacyService } from "./privacyService.js";
import { createVerificationService } from "./verificationService.js";
import { createWisePaymentReportService } from "./wisePaymentReportService.js";
import {
  createAssessmentTokenFactory,
  createVerificationReturnTokenFactory
} from "./tokens.js";

const TEST_SECRET = "auralis-deterministic-hiring-secret-000000000000";

export function createTestHiringRuntime({
  clock = { now: () => new Date("2026-07-10T12:00:00.000Z") },
  tokenSecret = TEST_SECRET
} = {}) {
  const providers = createTestHiringProviders({ clock });
  const assessmentTokenFactory = createAssessmentTokenFactory(tokenSecret);
  const verificationTokenFactory = createVerificationTokenFactory(tokenSecret);
  const baseReturnTokenFactory = createVerificationReturnTokenFactory(tokenSecret);
  const returnTokenFactory = (input) => {
    const token = baseReturnTokenFactory(input);
    providers.state.latestReturnToken = token;
    return token;
  };

  const application = createApplicationService({
    repository: providers.repositories.application,
    storage: providers.storage,
    email: providers.email,
    recruiterEmail: "auralis.careers@proton.me",
    clock,
    tokenFactory: () => providers.controls.nextToken(),
    assessmentTokenFactory,
    referenceFactory: () => `AUR-${providers.state.applications.length + 1}`
  });
  const assessment = createAssessmentService({
    repository: providers.repositories.assessment,
    email: providers.email,
    clock,
    orderer: createAssessmentOrderer(tokenSecret),
    tokenFactory: () => providers.controls.nextToken(),
    verificationTokenFactory,
    reminderTokenFactory: assessmentTokenFactory
  });
  const verification = createVerificationService({
    repository: providers.repositories.verification,
    payment: providers.payment,
    email: providers.email,
    clock,
    returnTokenFactory
  });
  const wisePaymentReport = createWisePaymentReportService({
    repository: providers.repositories.wisePaymentReport,
    email: providers.email,
    clock
  });
  const privacy = createHiringPrivacyService({
    repository: providers.repositories.privacy,
    storage: providers.storage,
    email: providers.email,
    clock,
    tokenFactory: () => providers.controls.nextToken("privacy")
  });

  return {
    application,
    assessment,
    verification,
    wisePaymentReport,
    privacy,
    providers,
    campaign: {
      id: providers.campaign.id,
      token: providers.campaign.token,
      roleSlug: providers.campaign.role.slug
    }
  };
}

let sharedRuntime;

export function getTestHiringRuntime(env = {}) {
  if (!sharedRuntime) {
    sharedRuntime = createTestHiringRuntime({
      tokenSecret: env.HIRING_TOKEN_SECRET ?? TEST_SECRET
    });
  }
  return sharedRuntime;
}
