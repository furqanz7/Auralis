import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import VerificationPage from "../../src/hiring/pages/VerificationPage.jsx";

const WISE_PAYMENT_URL =
  "https://wise.com/pay/business/furqanm135?utm_source=open_link";

function client(paymentUrl = WISE_PAYMENT_URL) {
  return {
    getVerificationStatus: vi.fn(async () => ({
      state: "pending",
      applicationReference: "AUR-1",
      candidateEmail: "nino@example.com",
      role: { title: "Senior AI Product Engineer" },
      checkoutAvailable: Boolean(paymentUrl),
      payment: paymentUrl
        ? { provider: "wise", mode: "manual", url: paymentUrl }
        : null,
      verification: { amountMinor: 299, currency: "EUR" }
    }))
  };
}

function renderPage(api) {
  render(
    <MemoryRouter initialEntries={["/verify/private-verification-token"]}>
      <Routes>
        <Route
          path="/verify/:token"
          element={<VerificationPage client={api} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

let writeText;
let user;

beforeEach(() => {
  sessionStorage.clear();
  user = userEvent.setup();
  writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
});

afterEach(() => {
  delete document.execCommand;
});

describe("VerificationPage", () => {
  test("explains the manual Wise payment and refund without collecting card data", async () => {
    renderPage(client());

    expect(
      await screen.findByRole("heading", { name: "One final step" })
    ).toBeVisible();
    expect(screen.getByText(/select EUR and enter €2\.99/i)).toBeVisible();
    expect(screen.getByText(/refund is initiated manually/i)).toBeVisible();
    expect(screen.getByText(/refund timing varies/i)).toBeVisible();
    expect(screen.getByText(/never changes.*review order/i)).toBeVisible();
    expect(screen.queryByLabelText(/card number|cvv|expiry|cardholder/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Wise payment link" })).toHaveAttribute(
      "href",
      WISE_PAYMENT_URL
    );
    expect(screen.getByRole("link", { name: "Open Wise payment link" })).toHaveAttribute(
      "target",
      "_blank"
    );
  });

  test("copies the application reference for Wise's Description field", async () => {
    const api = client();
    renderPage(api);

    const button = await screen.findByRole("button", {
      name: "Copy application reference"
    });
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("AUR-1");
    expect(
      screen.getByRole("button", { name: "Application reference copied" })
    ).toBeVisible();
  });

  test("copies the reference when the modern Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    renderPage(client());

    await user.click(
      await screen.findByRole("button", { name: "Copy application reference" })
    );

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(
      screen.getByRole("button", { name: "Application reference copied" })
    ).toBeVisible();
  });

  test("refuses a payment URL outside Wise's Business payment path", async () => {
    renderPage(client("https://lookalike.example/pay/business/furqanm135"));

    expect(
      await screen.findByRole("heading", { name: "One final step" })
    ).toBeVisible();
    expect(screen.getByText(/payment link is currently unavailable/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open Wise payment link" })).not.toBeInTheDocument();
  });

  test("keeps a valid application visible while the Wise link is unavailable", async () => {
    renderPage(client(null));

    expect(
      await screen.findByRole("heading", { name: "One final step" })
    ).toBeVisible();
    expect(screen.getByText(/payment link is currently unavailable/i)).toBeVisible();
    expect(screen.getByText(/application remains submitted/i)).toBeVisible();
  });
});
