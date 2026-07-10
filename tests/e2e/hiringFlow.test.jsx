import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { createTestHiringRuntime } from "../../api/_lib/testHiringRuntime.js";
import ApplicationCompletePage from "../../src/hiring/pages/ApplicationCompletePage.jsx";
import { advanceToVerification } from "./flowFixture.js";

test("completes the private contractor path exactly once", async () => {
  const runtime = createTestHiringRuntime();
  const { application } = await advanceToVerification(runtime);
  const emailTypesBeforePayment = runtime.providers.state.emails.map(
    (message) => message.type
  );

  expect(application).toEqual({
    applicationReference: "AUR-1"
  });
  expect(emailTypesBeforePayment).toEqual(
    expect.arrayContaining([
      "recruiter_application",
      "recruiter_assessment"
    ])
  );
  expect(emailTypesBeforePayment).not.toContain("verification_complete_candidate");

  const providerPaymentId = runtime.providers.controls.latestProviderPaymentId();
  runtime.providers.controls.authorizePayment(providerPaymentId);
  await runtime.verification.handleCallback({ providerPaymentId });
  await runtime.verification.handleCallback({ providerPaymentId });

  expect(runtime.providers.state.paymentCancellations).toEqual([
    providerPaymentId
  ]);
  expect(
    runtime.providers.state.emails.filter(
      (message) => message.type === "verification_complete_candidate"
    )
  ).toHaveLength(1);
  expect(emailTypesBeforePayment).not.toContain("assessment_invite");
  expect(
    runtime.providers.state.emails.filter(
      (message) => message.type === "verification_complete_recruiter"
    )
  ).toHaveLength(1);

  const client = {
    getVerificationStatus: (token) =>
      runtime.verification.getStatus({ verificationToken: token })
  };
  render(
    <MemoryRouter
      initialEntries={[
        `/application/AUR-1/complete/${runtime.providers.state.latestReturnToken}`
      ]}
    >
      <Routes>
        <Route
          path="/application/:reference/complete/:returnToken"
          element={<ApplicationCompletePage client={client} pollInterval={5} />}
        />
      </Routes>
    </MemoryRouter>
  );

  expect(
    await screen.findByRole("heading", { name: "Your application is with us" })
  ).toBeVisible();
  expect(screen.getByText("Temporary authorization cancelled")).toBeVisible();
  expect(document.body.textContent).not.toMatch(/score|passed|hired|priority/i);
});
