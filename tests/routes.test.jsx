import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { AppRoutes } from "../src/routes/AppRoutes.jsx";

test("renders the private application route without the public site navigation", () => {
  render(
    <MemoryRouter
      initialEntries={["/apply/senior-ai-product-engineer/demo-campaign"]}
    >
      <AppRoutes />
    </MemoryRouter>
  );

  expect(
    screen.getByRole("heading", { name: "Private application" })
  ).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Site" })).not.toBeInTheDocument();
});

test("renders the real privacy policy instead of falling through to the homepage", () => {
  render(
    <MemoryRouter initialEntries={["/privacy"]}>
      <AppRoutes />
    </MemoryRouter>
  );

  expect(
    screen.getByRole("heading", { name: "Privacy, without obscurity" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /Digital products/i })
  ).not.toBeInTheDocument();
});
