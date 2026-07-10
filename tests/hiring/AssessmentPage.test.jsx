import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import AssessmentPage from "../../src/hiring/pages/AssessmentPage.jsx";

function question(id, prompt) {
  return {
    id,
    prompt,
    options: [
      { id: "a", label: "Option alpha" },
      { id: "b", label: "Option beta" },
      { id: "c", label: "Option gamma" },
      { id: "d", label: "Option delta" }
    ]
  };
}

function started(questions = [
  question("q-1", "Which architecture preserves a clear recovery boundary?"),
  question("q-2", "Which delivery sequence reduces the highest product risk first?")
]) {
  return {
    status: "started",
    applicationReference: "AUR-1",
    role: { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" },
    questions,
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    responseVersion: 0,
    responses: {}
  };
}

function client(session = started()) {
  let version = session.responseVersion;
  return {
    getAssessment: vi.fn(async () => session),
    startAssessment: vi.fn(async () => started()),
    saveAssessmentAnswer: vi.fn(async () => ({
      version: ++version,
      savedAt: new Date().toISOString()
    })),
    submitAssessment: vi.fn(async () => ({
      applicationReference: "AUR-1",
      verificationToken: "private"
    }))
  };
}

function renderPage(api) {
  return render(
    <MemoryRouter initialEntries={["/assessment/private-token"]}>
      <Routes>
        <Route
          path="/assessment/:token"
          element={<AssessmentPage client={api} />}
        />
        <Route
          path="/verify/:token"
          element={<h1>Verification handoff</h1>}
        />
      </Routes>
    </MemoryRouter>
  );
}

let scrollIntoView;

beforeEach(() => {
  sessionStorage.clear();
  scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
});

describe("AssessmentPage", () => {
  test("starts an invited assessment only after explicit confirmation", async () => {
    const api = client({
      status: "invited",
      role: { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer" },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      durationSeconds: 1200,
      questionCount: 18
    });
    const user = userEvent.setup();
    renderPage(api);

    expect(await screen.findByRole("heading", { name: "Your private assessment" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start assessment" }));

    expect(api.startAssessment).toHaveBeenCalledWith("private-token");
    expect(await screen.findByText(/preserves a clear recovery boundary/i)).toBeVisible();
  });

  test("renders one semantic answer group and gates navigation on autosave", async () => {
    const api = client();
    const user = userEvent.setup();
    renderPage(api);

    expect(await screen.findByRole("radiogroup", { name: /recovery boundary/i })).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    const next = screen.getByRole("button", { name: "Next question" });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Option alpha" }));
    await waitFor(() => expect(next).toBeEnabled());
    expect(api.saveAssessmentAnswer).toHaveBeenCalledWith(
      "private-token",
      "q-1",
      "a",
      0
    );
    expect(screen.getByText("Answer saved")).toBeVisible();

    await user.click(next);
    expect(screen.getByText(/reduces the highest product risk/i)).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/preserves a clear recovery boundary/i)).toBeVisible();
  });

  test("supports keyboard selection and submits once without score language", async () => {
    const api = client(started([
      question("q-1", "Which architecture preserves a clear recovery boundary?")
    ]));
    const user = userEvent.setup();
    renderPage(api);

    const option = await screen.findByRole("radio", { name: "Option beta" });
    option.focus();
    await user.keyboard(" ");
    const submit = screen.getByRole("button", { name: "Submit assessment" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.dblClick(submit);

    expect(api.submitAssessment).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "Verification handoff" })).toBeVisible();
    expect(screen.queryByText(/score|passed|failed|correct/i)).not.toBeInTheDocument();
  });
});
