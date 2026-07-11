import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import VerificationPage from "../../src/hiring/pages/VerificationPage.jsx";

const WISE_PAYMENT_URL =
  "https://wise.com/pay/r/nAx15LFiReIdtjc";

function client(
  paymentUrl = WISE_PAYMENT_URL,
  paymentReport = { state: "not_reported", reportedAt: null }
) {
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
      verification: { amountMinor: 299, currency: "EUR" },
      paymentReport
    })),
    reportWisePayment: vi.fn(async () => ({
      state: "reported",
      reportedAt: "2026-07-11T10:00:00.000Z"
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
    renderPage(client("https://lookalike.example/pay/r/nAx15LFiReIdtjc"));

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

  test("reveals one payer-name field with read-only payment context", async () => {
    renderPage(client());

    await user.click(
      await screen.findByRole("button", {
        name: "I've completed the Wise payment"
      })
    );

    expect(
      screen.getByRole("textbox", { name: "Name used for the Wise payment" })
    ).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("EUR 2.99")).toBeVisible();
    expect(screen.getAllByText("AUR-1").length).toBeGreaterThan(0);
    expect(screen.getByText(/not proof Wise completed/i)).toBeVisible();
    expect(
      screen.queryByLabelText(/card|cvv|expiry|receipt|bank|account/i)
    ).not.toBeInTheDocument();
  });

  test("blocks blank and oversized payer names in the browser", async () => {
    const api = client();
    renderPage(api);
    await user.click(
      await screen.findByRole("button", {
        name: "I've completed the Wise payment"
      })
    );
    const field = screen.getByRole("textbox", {
      name: "Name used for the Wise payment"
    });

    await user.click(screen.getByRole("button", { name: "Report payment" }));
    expect(screen.getByText(/enter the name used for Wise/i)).toBeVisible();
    expect(api.reportWisePayment).not.toHaveBeenCalled();

    await user.type(field, "N".repeat(121));
    await user.click(screen.getByRole("button", { name: "Report payment" }));
    expect(screen.getByText(/120 characters or fewer/i)).toBeVisible();
    expect(api.reportWisePayment).not.toHaveBeenCalled();
  });

  test("submits a Unicode payer name and renders the final reported state", async () => {
    const api = client();
    renderPage(api);
    await user.click(
      await screen.findByRole("button", {
        name: "I've completed the Wise payment"
      })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name used for the Wise payment" }),
      "ნინო ბერიძე"
    );
    await user.click(screen.getByRole("button", { name: "Report payment" }));

    expect(api.reportWisePayment).toHaveBeenCalledWith(
      "private-verification-token",
      "ნინო ბერიძე"
    );
    expect(
      await screen.findByRole("heading", { name: "Payment reported" })
    ).toBeVisible();
    expect(
      screen.getByText(
        "Your application is complete. Auralis will manually match the EUR 2.99 payment and initiate the refund. No further action is required."
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        "Your application remains under independent review based on your experience, accomplishments, skills, and assessment. This payment report does not influence the hiring decision. Auralis will contact you if your application progresses."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Open Wise payment link" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /successful|verified|confirmed|matched|refunded/i
    );
  });

  test("saves a pending report and retries recruiter notification without a name", async () => {
    const api = client();
    api.reportWisePayment
      .mockResolvedValueOnce({
        state: "notification_pending",
        reportedAt: "2026-07-11T10:00:00.000Z"
      })
      .mockResolvedValueOnce({
        state: "reported",
        reportedAt: "2026-07-11T10:00:00.000Z"
      });
    renderPage(api);
    await user.click(
      await screen.findByRole("button", {
        name: "I've completed the Wise payment"
      })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name used for the Wise payment" }),
      "Nino Beridze"
    );
    await user.click(screen.getByRole("button", { name: "Report payment" }));

    expect(
      await screen.findByText(
        "Payment report saved. Recruiter notification is pending."
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Open Wise payment link" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "auralis.careers@proton.me" })
    ).toHaveAttribute("href", "mailto:auralis.careers@proton.me");

    await user.click(
      screen.getByRole("button", { name: "Retry recruiter notification" })
    );
    expect(api.reportWisePayment).toHaveBeenLastCalledWith(
      "private-verification-token"
    );
    expect(
      await screen.findByRole("heading", { name: "Payment reported" })
    ).toBeVisible();
  });

  test("renders a persisted reported status immediately after refresh", async () => {
    renderPage(
      client(WISE_PAYMENT_URL, {
        state: "reported",
        reportedAt: "2026-07-11T10:00:00.000Z"
      })
    );

    expect(
      await screen.findByRole("heading", { name: "Payment reported" })
    ).toBeVisible();
    expect(screen.getAllByText("AUR-1").length).toBeGreaterThan(0);
    expect(screen.getByText(/refund arrival depends on Wise/i)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Open Wise payment link" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "I've completed the Wise payment"
      })
    ).not.toBeInTheDocument();
  });
});
