export async function advanceToVerification(runtime) {
  const campaign = await runtime.application.validateCampaign({
    roleSlug: runtime.campaign.roleSlug,
    campaignToken: runtime.campaign.token
  });
  const upload = await runtime.application.createUploadUrl({
    campaignId: campaign.id,
    email: "nino@example.com",
    fileName: "nino-cv.pdf",
    mimeType: "application/pdf",
    size: 2048
  });
  runtime.providers.controls.uploadObject(upload.objectKey, {
    contentType: "application/pdf",
    size: 2048
  });

  const application = await runtime.application.submitApplication({
    idempotencyKey: "e2e-application-1",
    campaignToken: runtime.campaign.token,
    roleSlug: runtime.campaign.roleSlug,
    payload: {
      fullName: "Nino Beridze",
      email: "nino@example.com",
      country: "Georgia",
      timeZone: "Asia/Tbilisi",
      profileUrl: "https://www.linkedin.com/in/nino-beridze",
      availability: "20-30 hours",
      cvObjectKey: upload.objectKey,
      cvMimeType: "application/pdf",
      cvSize: 2048,
      privacyAccepted: true
    }
  });

  const recruiterNotification = runtime.providers.state.emails.find(
    (message) => message.type === "recruiter_application"
  );
  const started = await runtime.assessment.startAssessment(
    recruiterNotification.assessmentToken
  );
  let version = started.responseVersion;
  for (const question of started.questions) {
    const saved = await runtime.assessment.saveAnswer(
      recruiterNotification.assessmentToken,
      question.id,
      question.options[0].id,
      version
    );
    version = saved.version;
  }
  const assessment = await runtime.assessment.submitAssessment(
    recruiterNotification.assessmentToken
  );
  const session = await runtime.verification.createSession({
    verificationToken: assessment.verificationToken,
    returnBaseUrl: "https://auralis.test",
    idempotencyKey: "e2e-verification-session-1"
  });

  return { application, assessment, session };
}
