function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function privateUrl(siteUrl, path, token) {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  return new URL(`${path}/${encodeURIComponent(token)}`, base).toString();
}

export function createHiringEmailAdapter({
  emailClient,
  from,
  recruiterEmail,
  siteUrl
}) {
  async function send(message, idempotencyKey) {
    const { data, error } = await emailClient.emails.send(message, {
      idempotencyKey
    });
    if (error || !data?.id) throw new Error("Email provider rejected the message.");
    return { providerMessageId: data.id };
  }

  return {
    async enqueueRecruiterApplication({
      to,
      application,
      recruiterToken,
      assessmentToken
    }) {
      const cvUrl = privateUrl(siteUrl, "api/recruiter/cv", recruiterToken);
      const assessmentUrl = privateUrl(siteUrl, "assessment", assessmentToken);
      const roleTitle = escapeHtml(application.role.title);
      const candidateName = escapeHtml(application.fullName);
      return send(
        {
          from,
          to: [to],
          subject: `New contractor application - ${application.role.title}`,
          html: [
            `<p><strong>${candidateName}</strong> applied for ${roleTitle}.</p>`,
            `<p>Reference: ${escapeHtml(application.reference)}</p>`,
            `<p>Application route: ${escapeHtml(application.campaign.label)}</p>`,
            `<p>Email: ${escapeHtml(application.email)}</p>`,
            `<p><a href="${cvUrl}">Open CV</a> (single use; available for 30 days)</p>`,
            `<p><a href="${assessmentUrl}">Open private assessment link</a> (single use; expires 14 days after application)</p>`,
            "<p>Send this link manually to the candidate after your review. The application is ready for human review regardless of assessment or verification completion.</p>"
          ].join("")
        },
        `recruiter-application/${application.id}`
      );
    },

    async enqueueRecruiterAssessment({
      application,
      recruiterToken,
      result,
      reason
    }) {
      const cvUrl = privateUrl(siteUrl, "api/recruiter/cv", recruiterToken);
      const minutes = Math.floor(result.durationSeconds / 60);
      const seconds = String(result.durationSeconds % 60).padStart(2, "0");
      return send(
        {
          from,
          to: [recruiterEmail],
          subject: `Assessment received - ${application.role.title}`,
          html: [
            `<p><strong>${escapeHtml(application.fullName)}</strong> completed the ${escapeHtml(application.role.title)} assessment.</p>`,
            `<p>Reference: ${escapeHtml(application.reference)}</p>`,
            `<p>Completion: ${reason === "expired" ? "Timer expired" : "Submitted"}</p>`,
            `<p>Total: ${result.rawScore}/18</p>`,
            `<p>Craft: ${result.dimensionScores.craft}/6<br>Systems: ${result.dimensionScores.systems}/4<br>Judgment: ${result.dimensionScores.judgment}/4<br>Delivery: ${result.dimensionScores.delivery}/4</p>`,
            `<p>Duration: ${minutes}m ${seconds}s</p>`,
            `<p><a href="${cvUrl}">Open CV</a> (single use; available for 30 days)</p>`,
            "<p>The result supports human review and is independent of application verification.</p>"
          ].join("")
        },
        `recruiter-assessment/${application.id}`
      );
    },

    async enqueueAssessmentReminder({ session, assessmentToken }) {
      const { application } = session;
      const assessmentUrl = privateUrl(siteUrl, "assessment", assessmentToken);
      const expiry = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short"
      }).format(session.invitationExpiresAt);
      return send(
        {
          from,
          to: [application.email],
          subject: `${application.role.title} - assessment reminder`,
          html: [
            `<p>Hello ${escapeHtml(application.fullName)},</p>`,
            `<p>Your private assessment for the ${escapeHtml(application.role.title)} independent contractor role is still available.</p>`,
            `<p><a href="${assessmentUrl}">Open your private assessment</a></p>`,
            `<p>The link expires ${escapeHtml(expiry)}. It contains 18 multiple-choice questions and takes up to 20 minutes.</p>`,
            "<p>Your application remains subject to human review.</p>"
          ].join("")
        },
        `assessment-reminder/${application.id}`
      );
    },

    async enqueueVerificationCompleteCandidate({ application, verification }) {
      return send(
        {
          from,
          to: [application.email],
          subject: `${application.role.title} - verification complete`,
          html: [
            `<p>Hello ${escapeHtml(application.fullName)},</p>`,
            `<p>The EUR 2.99 preauthorization for reference ${escapeHtml(application.reference)} was cancelled and released immediately.</p>`,
            "<p>Your bank may take additional time to display the released amount in your account.</p>",
            "<p>Auralis will continue the independent human review of your application based on experience and skills.</p>",
            `<p>Verification reference: ${escapeHtml(verification.merchantReference)}</p>`
          ].join("")
        },
        `verification-complete-candidate/${application.id}`
      );
    },

    async enqueueVerificationCompleteRecruiter({ application, verification }) {
      return send(
        {
          from,
          to: [recruiterEmail],
          subject: `Verification complete - ${application.role.title}`,
          html: [
            `<p>Application ${escapeHtml(application.reference)} completed the optional hosted verification.</p>`,
            `<p>Candidate: ${escapeHtml(application.fullName)} (${escapeHtml(application.email)})</p>`,
            `<p>Role: ${escapeHtml(application.role.title)}</p>`,
            `<p>Merchant reference: ${escapeHtml(verification.merchantReference)}</p>`,
            "<p>The preauthorization was cancelled. This event does not alter independent human review.</p>"
          ].join("")
        },
        `verification-complete-recruiter/${application.id}`
      );
    },

    async enqueueVerificationAlert({ application, verification, errorCategory }) {
      return send(
        {
          from,
          to: [recruiterEmail],
          subject: `Verification requires attention - ${application.reference}`,
          html: [
            `<p>Verification ${escapeHtml(verification.id)} requires operational review.</p>`,
            `<p>Application: ${escapeHtml(application.reference)}</p>`,
            `<p>Merchant reference: ${escapeHtml(verification.merchantReference)}</p>`,
            `<p>Provider reference: ${escapeHtml(verification.providerPaymentId ?? "not assigned")}</p>`,
            `<p>Error category: ${escapeHtml(errorCategory)}</p>`,
            "<p>No sensitive payment details are stored or included in this alert.</p>"
          ].join("")
        },
        `verification-alert/${verification.id}/${errorCategory}`
      );
    },

    async enqueueWisePaymentReport({ application, paymentReport }) {
      return send(
        {
          from,
          to: [recruiterEmail],
          subject: `Wise payment reported - ${application.reference}`,
          html: [
            `<p>Application reference: ${escapeHtml(application.reference)}</p>`,
            `<p>Candidate: ${escapeHtml(application.fullName)} (${escapeHtml(application.email)})</p>`,
            `<p>Role: ${escapeHtml(application.role.title)}</p>`,
            `<p>Name used for the Wise payment: ${escapeHtml(paymentReport.payerName)}</p>`,
            "<p>Amount reported: EUR 2.99</p>",
            `<p>Reported at: ${escapeHtml(new Date(paymentReport.reportedAt).toISOString())}</p>`,
            "<p>Confirm the transaction in Wise and initiate the refund manually.</p>",
            "<p>This report is not proof that Wise completed the payment and does not affect hiring review or selection.</p>"
          ].join("")
        },
        `wise-payment-report/${application.id}`
      );
    },

    async enqueueDeletionConfirmation({ application, deletionToken }) {
      const confirmationUrl = privateUrl(
        siteUrl,
        "privacy/delete",
        deletionToken
      );
      return send(
        {
          from,
          to: [application.email],
          subject: "Confirm your Auralis application deletion request",
          html: [
            `<p>Hello ${escapeHtml(application.fullName)},</p>`,
            "<p>We received a request to delete your Auralis contractor application and CV.</p>",
            `<p><a href="${confirmationUrl}">Review and confirm deletion</a></p>`,
            "<p>Opening the link will not delete anything. You will be asked to confirm on the Auralis website.</p>",
            "<p>This private link expires in 24 hours. If you did not make this request, you can ignore this email.</p>"
          ].join("")
        },
        `privacy-deletion/${application.id}`
      );
    }
  };
}
