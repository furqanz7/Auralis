import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import PrivacyPage from "../../src/hiring/pages/PrivacyPage.jsx";
import PrivacyDeletionPage from "../../src/hiring/pages/PrivacyDeletionPage.jsx";

describe("hiring privacy experience", () => {
  test("publishes the hiring data lifecycle and human-review safeguards", () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Privacy, without obscurity" })
    ).toBeVisible();
    expect(screen.getByText(/180 days after the most recent activity/i)).toBeVisible();
    expect(screen.getByText(/no automated hiring decisions/i)).toBeVisible();
    expect(screen.getByText(/Auralis, located in Tbilisi, Georgia/i)).toBeVisible();
    expect(screen.getByText(/Supabase/i)).toBeVisible();
    expect(screen.getByText(/Resend/i)).toBeVisible();
    expect(screen.queryByText(/Cloudflare Turnstile/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Wise.*manual payment link/i)).toBeVisible();
    expect(screen.getByText(/refund.*initiated manually/i)).toBeVisible();
    expect(screen.getByText(/refund timing varies/i)).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "auralis.careers@proton.me" })[0]
    ).toHaveAttribute("href", "mailto:auralis.careers@proton.me");
  });

  test("directs deletion requests to the private operations inbox", () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Email deletion request" })
    ).toHaveAttribute(
      "href",
      "mailto:auralis.careers@proton.me?subject=Application%20deletion%20request"
    );
  });

  test("does not delete when a private confirmation link is merely opened", async () => {
    const client = {
      confirmPrivacyDeletion: vi.fn(async () => ({ deleted: true }))
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={["/privacy/delete/privacy-token-with-enough-entropy"]}
      >
        <Routes>
          <Route
            path="/privacy/delete/:token"
            element={<PrivacyDeletionPage client={client} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Delete your application" })
    ).toBeVisible();
    expect(client.confirmPrivacyDeletion).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Permanently delete application" })
    );
    await waitFor(() =>
      expect(client.confirmPrivacyDeletion).toHaveBeenCalledWith(
        "privacy-token-with-enough-entropy"
      )
    );
    expect(
      await screen.findByRole("heading", { name: "Application deleted" })
    ).toBeVisible();
  });
});
