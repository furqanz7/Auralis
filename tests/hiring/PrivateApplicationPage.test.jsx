import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import PrivateApplicationPage from "../../src/hiring/pages/PrivateApplicationPage.jsx";
import { getRoleBySlug } from "../../shared/hiring/roles.js";

function renderPage(client) {
  return render(
    <MemoryRouter
      initialEntries={["/apply/senior-ai-product-engineer/private-token"]}
    >
      <Routes>
        <Route
          path="/apply/:roleSlug/:campaignToken"
          element={<PrivateApplicationPage client={client} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("PrivateApplicationPage", () => {
  test("loads the role-specific private campaign without public navigation", async () => {
    const role = getRoleBySlug("senior-ai-product-engineer");
    const client = {
      getCampaign: vi.fn(async () => ({
        id: "campaign-id",
        label: "Instagram / AI product",
        role
      }))
    };

    renderPage(client);

    expect(screen.getByRole("heading", { name: "Private application" })).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Senior AI Product Engineer" })
    ).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Site" })).not.toBeInTheDocument();
    expect(client.getCampaign).toHaveBeenCalledWith(
      "senior-ai-product-engineer",
      "private-token"
    );
    expect(screen.queryByText(/security verification/i)).not.toBeInTheDocument();
  });

  test("shows one generic unavailable state", async () => {
    renderPage({
      getCampaign: vi.fn(async () => {
        throw { code: "CAMPAIGN_UNAVAILABLE" };
      })
    });

    expect(
      await screen.findByRole("heading", { name: "Application unavailable" })
    ).toBeVisible();
    expect(screen.getByText(/request a current private link/i)).toBeVisible();
  });
});
