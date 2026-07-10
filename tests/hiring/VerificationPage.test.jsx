import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import VerificationPage from "../../src/hiring/pages/VerificationPage.jsx";

function client(approvalUrl = "https://tpay.tbcbank.ge/checkout/payment-1") {
  return {
    getVerificationStatus: vi.fn(async () => ({
      state: "pending",
      applicationReference: "AUR-1",
      candidateEmail: "nino@example.com",
      role: { title: "Senior AI Product Engineer" },
      verification: { amountMinor: 299, currency: "EUR" }
    })),
    createVerificationSession: vi.fn(async () => ({ approvalUrl }))
  };
}

function renderPage(api, navigateExternal = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/verify/private-verification-token"]}>
      <Routes>
        <Route
          path="/verify/:token"
          element={
            <VerificationPage
              client={api}
              navigateExternal={navigateExternal}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return { navigateExternal };
}

beforeEach(() => sessionStorage.clear());

describe("VerificationPage", () => {
  test("explains the temporary authorization without collecting card data", async () => {
    renderPage(client());

    expect(
      await screen.findByRole("heading", { name: "One final verification" })
    ).toBeVisible();
    expect(screen.getAllByText(/€2\.99/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/never changes.*review order/i)).toBeVisible();
    expect(screen.queryByLabelText(/card number|cvv|expiry|cardholder/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /tbc/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to payment portal" })
    ).toBeEnabled();
  });

  test("uses a stable idempotency key and navigates to the validated host in the same tab", async () => {
    const api = client();
    const navigateExternal = vi.fn();
    const user = userEvent.setup();
    renderPage(api, navigateExternal);

    const button = await screen.findByRole("button", {
      name: "Continue to payment portal"
    });
    button.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(navigateExternal).toHaveBeenCalledWith(
      "https://tpay.tbcbank.ge/checkout/payment-1"
    ));
    expect(api.createVerificationSession).toHaveBeenCalledWith(
      "private-verification-token",
      expect.stringMatching(/^verification-/)
    );
    const firstKey = api.createVerificationSession.mock.calls[0][1];

    renderPage(api, navigateExternal);
    await user.click(await screen.findAllByRole("button", {
      name: "Continue to payment portal"
    }).then((items) => items.at(-1)));
    expect(api.createVerificationSession.mock.calls.at(-1)[1]).toBe(firstKey);
  });

  test("refuses an approval URL outside the configured TBC host", async () => {
    const api = client("https://lookalike.example/checkout/payment-1");
    const navigateExternal = vi.fn();
    const user = userEvent.setup();
    renderPage(api, navigateExternal);

    await user.click(
      await screen.findByRole("button", { name: "Continue to payment portal" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be opened/i);
    expect(navigateExternal).not.toHaveBeenCalled();
  });
});
