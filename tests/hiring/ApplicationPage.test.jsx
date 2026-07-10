import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import ApplicationPage from "../../src/hiring/pages/ApplicationPage.jsx";
import { getRoleBySlug } from "../../shared/hiring/roles.js";

function renderPage(client) {
  return render(
    <MemoryRouter initialEntries={["/apply"]}>
      <Routes>
        <Route path="/apply" element={<ApplicationPage client={client} />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("ApplicationPage", () => {
  test("loads the unlisted direct application page and lets the applicant choose a role", async () => {
    const user = userEvent.setup();
    const role = getRoleBySlug("senior-ai-product-engineer");
    const client = {
      getApplicationRoles: vi.fn(async () => [role])
    };

    renderPage(client);

    expect(await screen.findByLabelText("Role")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Choose your role." })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Site" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Role"), role.slug);

    expect(
      screen.getByRole("heading", { name: "Senior AI Product Engineer" })
    ).toBeVisible();
    expect(client.getApplicationRoles).toHaveBeenCalledTimes(1);
  });

  test("shows an unavailable state when no role can accept applications", async () => {
    renderPage({ getApplicationRoles: vi.fn(async () => []) });

    expect(
      await screen.findByRole("heading", { name: "Applications unavailable" })
    ).toBeVisible();
  });
});
