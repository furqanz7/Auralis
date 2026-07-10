import { describe, expect, test, vi } from "vitest";
import { createHiringEmailAdapter } from "../../api/_lib/adapters/hiringEmail.js";

function createFixture() {
  const send = vi.fn(async () => ({ data: { id: "email-id" }, error: null }));
  const adapter = createHiringEmailAdapter({
    emailClient: { emails: { send } },
    from: "Auralis Hiring <onboarding@resend.dev>",
    recruiterEmail: "auralis.careers@proton.me",
    siteUrl: "https://auralis.studio"
  });
  const application = {
    id: "application-1",
    reference: "AUR-1",
    fullName: "Nino <script>",
    email: "nino@example.com",
    cvObjectKey: "campaign/upload/cv.pdf",
    role: { title: "Senior AI Product Engineer" },
    campaign: { label: "Instagram / AI product" }
  };

  return { adapter, application, send };
}

describe("hiring email adapter", () => {
  test("sends Proton the candidate details, CV link, and manual assessment link", async () => {
    const { adapter, application, send } = createFixture();

    await adapter.enqueueRecruiterApplication({
      to: "auralis.careers@proton.me",
      application,
      recruiterToken: "recruiter/token",
      assessmentToken: "assessment/token"
    });

    const [message, options] = send.mock.calls[0];
    expect(message.to).toEqual(["auralis.careers@proton.me"]);
    expect(message.html).toContain(
      "https://auralis.studio/api/recruiter/cv/recruiter%2Ftoken"
    );
    expect(message.html).toContain(
      "https://auralis.studio/assessment/assessment%2Ftoken"
    );
    expect(message.html).toMatch(/send this link manually/i);
    expect(message.html).not.toContain("<script>");
    expect(message).not.toHaveProperty("attachments");
    expect(options).toEqual({
      idempotencyKey: "recruiter-application/application-1"
    });
  });

  test("sends recruiter assessment results before verification", async () => {
    const { adapter, application, send } = createFixture();

    await adapter.enqueueRecruiterAssessment({
      application,
      recruiterToken: "result/cv-token",
      reason: "submitted",
      result: {
        rawScore: 14,
        dimensionScores: { craft: 5, systems: 3, judgment: 3, delivery: 3 },
        durationSeconds: 754
      }
    });

    const [message, options] = send.mock.calls[0];
    expect(message.to).toEqual(["auralis.careers@proton.me"]);
    expect(message.html).toContain("14/18");
    expect(message.html).toContain("Craft: 5/6");
    expect(message.html).toContain("12m 34s");
    expect(message.html).toContain(
      "https://auralis.studio/api/recruiter/cv/result%2Fcv-token"
    );
    expect(message.html.toLowerCase()).not.toContain("passed");
    expect(options).toEqual({
      idempotencyKey: "recruiter-assessment/application-1"
    });
  });

  test("sends one private candidate reminder without result language", async () => {
    const { adapter, application, send } = createFixture();

    await adapter.enqueueAssessmentReminder({
      session: {
        id: "session-1",
        invitationExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
        application
      },
      assessmentToken: "assessment/reminder-token"
    });

    const [message, options] = send.mock.calls[0];
    expect(message.to).toEqual(["nino@example.com"]);
    expect(message.html).toContain("Senior AI Product Engineer");
    expect(message.html).toContain("13 July 2026");
    expect(message.html).toContain(
      "https://auralis.studio/assessment/assessment%2Freminder-token"
    );
    expect(message.html).not.toMatch(/score|passed|failed|correct/i);
    expect(options).toEqual({
      idempotencyKey: "assessment-reminder/application-1"
    });
  });

  test("confirms released verification without implying a hiring outcome", async () => {
    const { adapter, application, send } = createFixture();
    const verification = {
      id: "verification-1",
      merchantReference: "VERIFY-AUR-1",
      amountMinor: 299,
      currency: "EUR"
    };

    await adapter.enqueueVerificationCompleteCandidate({
      application,
      verification
    });
    await adapter.enqueueVerificationCompleteRecruiter({
      application,
      verification
    });

    const [candidate, candidateOptions] = send.mock.calls[0];
    expect(candidate.to).toEqual(["nino@example.com"]);
    expect(candidate.html).toContain("EUR 2.99");
    expect(candidate.html).toMatch(/cancelled|released/i);
    expect(candidate.html).toMatch(/bank.*display|issuer.*display/i);
    expect(candidate.html).not.toMatch(/hired|offer|passed|priority|score/i);
    expect(candidateOptions).toEqual({
      idempotencyKey: "verification-complete-candidate/application-1"
    });

    const [recruiter, recruiterOptions] = send.mock.calls[1];
    expect(recruiter.to).toEqual(["auralis.careers@proton.me"]);
    expect(recruiter.html).toContain("AUR-1");
    expect(recruiter.html).not.toMatch(/priority|rank/i);
    expect(recruiterOptions).toEqual({
      idempotencyKey: "verification-complete-recruiter/application-1"
    });
  });

  test("sends a redacted verification operations alert", async () => {
    const { adapter, application, send } = createFixture();

    await adapter.enqueueVerificationAlert({
      application,
      verification: {
        id: "verification-1",
        merchantReference: "VERIFY-AUR-1",
        providerPaymentId: "tpay-payment-1"
      },
      errorCategory: "PROVIDER_MISMATCH"
    });

    const [message, options] = send.mock.calls[0];
    expect(message.to).toEqual(["auralis.careers@proton.me"]);
    expect(message.html).toContain("PROVIDER_MISMATCH");
    expect(message.html).not.toMatch(/card|cvv|pan/i);
    expect(options).toEqual({
      idempotencyKey: "verification-alert/verification-1/PROVIDER_MISMATCH"
    });
  });

  test("sends a private deletion confirmation without deleting on link open", async () => {
    const { adapter, application, send } = createFixture();

    await adapter.enqueueDeletionConfirmation({
      application,
      deletionToken: "privacy/delete-token"
    });

    const [message, options] = send.mock.calls[0];
    expect(message.to).toEqual(["nino@example.com"]);
    expect(message.html).toContain(
      "https://auralis.studio/privacy/delete/privacy%2Fdelete-token"
    );
    expect(message.html).toMatch(/confirm/i);
    expect(message.html).toMatch(/24 hours/i);
    expect(options).toEqual({
      idempotencyKey: "privacy-deletion/application-1"
    });
  });
});
