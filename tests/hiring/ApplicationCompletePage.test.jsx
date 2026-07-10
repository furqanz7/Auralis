import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import ApplicationCompletePage from "../../src/hiring/pages/ApplicationCompletePage.jsx";

function renderPage(status) {
  const client = { getVerificationStatus: vi.fn(async () => status) };
  render(
    <MemoryRouter initialEntries={["/application/AUR-ROUTE/complete/return-token"]}>
      <Routes>
        <Route
          path="/application/:reference/complete/:returnToken"
          element={<ApplicationCompletePage client={client} pollInterval={10} />}
        />
      </Routes>
    </MemoryRouter>
  );
  return client;
}

describe("ApplicationCompletePage", () => {
  test("renders only server-confirmed completion details", async () => {
    renderPage({
      state: "completed",
      applicationReference: "AUR-1",
      candidateEmail: "nino@example.com",
      role: { title: "Senior AI Product Engineer" },
      verification: {
        amountMinor: 299,
        currency: "EUR",
        authorization: "confirmed",
        release: "confirmed"
      }
    });

    expect(
      await screen.findByRole("heading", { name: "Your application is with us" })
    ).toBeVisible();
    expect(screen.getByText("CV received")).toBeVisible();
    expect(screen.getByText("Assessment submitted")).toBeVisible();
    expect(screen.getByText("Temporary authorization cancelled")).toBeVisible();
    expect(screen.getByText(/bank controls when.*disappears/i)).toBeVisible();
    expect(screen.getByText(/AUR-1/)).toBeVisible();
    expect(screen.getByText(/nino@example.com/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(
      /score|passed|hired|job offer|priority/i
    );
  });

  test("does not claim completion while the callback is delayed", async () => {
    renderPage({
      state: "processing",
      applicationReference: "AUR-1",
      candidateEmail: "nino@example.com",
      role: { title: "Senior AI Product Engineer" }
    });

    expect(
      await screen.findByRole("heading", { name: "Verification is processing" })
    ).toBeVisible();
    expect(screen.queryByText("Temporary authorization cancelled")).not.toBeInTheDocument();
    expect(screen.getByText(/application remains available for human review/i)).toBeVisible();
  });
});
