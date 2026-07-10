import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import { createTestHiringRuntime } from "../../api/_lib/testHiringRuntime.js";
import ApplicationCompletePage from "../../src/hiring/pages/ApplicationCompletePage.jsx";
import { advanceToVerification } from "./flowFixture.js";

test("a browser return cannot claim success before the provider callback", async () => {
  const runtime = createTestHiringRuntime();
  await advanceToVerification(runtime);
  const returnToken = runtime.providers.state.latestReturnToken;
  const client = {
    getVerificationStatus: (token) =>
      runtime.verification.getStatus({ verificationToken: token })
  };

  render(
    <MemoryRouter
      initialEntries={[`/application/AUR-1/complete/${returnToken}`]}
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
    await screen.findByRole("heading", { name: "Verification is processing" })
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Your application is with us" })
  ).not.toBeInTheDocument();

  const providerPaymentId = runtime.providers.controls.latestProviderPaymentId();
  runtime.providers.controls.authorizePayment(providerPaymentId);
  await runtime.verification.handleCallback({ providerPaymentId });

  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Your application is with us" })
    ).toBeVisible()
  );
});
