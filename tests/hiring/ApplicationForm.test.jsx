import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import ApplicationForm from "../../src/hiring/components/ApplicationForm.jsx";
import { getRoleBySlug } from "../../shared/hiring/roles.js";

const campaign = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  label: "Instagram / Product design"
};
const designRole = getRoleBySlug("senior-product-designer");

function createClient() {
  return {
    createUploadUrl: vi.fn(async () => ({
      objectKey: `${campaign.id}/upload/cv.pdf`,
      uploadUrl: "https://project-ref.supabase.co/storage/upload"
    })),
    uploadCv: vi.fn(async () => undefined),
    submitApplication: vi.fn(async () => ({
      applicationReference: "AUR-1"
    }))
  };
}

async function fillForm(user, { includeProfile = true } = {}) {
  await user.type(screen.getByLabelText("Full name"), "Nino Beridze");
  await user.type(screen.getByLabelText("Email address"), "nino@example.com");
  await user.selectOptions(screen.getByLabelText("Country"), "Georgia");
  await user.selectOptions(screen.getByLabelText("Time zone"), "Asia/Tbilisi");
  if (includeProfile) {
    await user.type(
      screen.getByLabelText(/Portfolio, LinkedIn, or GitHub URL/),
      "https://linkedin.com/in/nino"
    );
  }
  await user.selectOptions(screen.getByLabelText("Weekly availability"), "20-30 hours");
  await user.upload(
    screen.getByLabelText("CV / Resume"),
    new File(["resume"], "resume.pdf", { type: "application/pdf" })
  );
  await user.click(screen.getByLabelText(/I agree to the privacy notice/));
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("ApplicationForm", () => {
  test("renders persistent labels for every collected field", () => {
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={createClient()}
      />
    );

    expect(screen.getByLabelText("Full name")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toBeVisible();
    expect(screen.getByLabelText("Country")).toBeVisible();
    expect(screen.getByLabelText("Time zone")).toBeVisible();
    expect(screen.getByLabelText("Weekly availability")).toBeVisible();
    expect(screen.getByLabelText("CV / Resume")).toBeInTheDocument();
  });

  test("uses the checkbox itself as the privacy consent control", () => {
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={createClient()}
      />
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "I agree to the privacy notice"
    });
    expect(checkbox).not.toBeChecked();
    expect(checkbox.closest("label").querySelector("svg")).toBeNull();
  });

  test("rejects a non-PDF CV before requesting an upload URL", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const client = createClient();
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
      />
    );
    const file = new File(["resume"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    await user.upload(screen.getByLabelText("CV / Resume"), file);

    expect(screen.getByText("Upload a PDF up to 5 MB.")).toBeInTheDocument();
    expect(client.createUploadUrl).not.toHaveBeenCalled();
  });

  test("rejects a PDF larger than 5 MB", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={createClient()}
      />
    );
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "resume.pdf", {
      type: "application/pdf"
    });

    await user.upload(screen.getByLabelText("CV / Resume"), file);

    expect(screen.getByText("Upload a PDF up to 5 MB.")).toBeInTheDocument();
  });

  test("requires a profile URL for design roles", async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
      />
    );
    await fillForm(user, { includeProfile: false });

    await user.click(screen.getByRole("button", { name: "Submit application" }));

    expect(
      screen.getByText("Add a portfolio, LinkedIn, or GitHub URL.")
    ).toBeInTheDocument();
    expect(client.createUploadUrl).not.toHaveBeenCalled();
  });

  test("shows a stable pending state during upload", async () => {
    const user = userEvent.setup();
    let releaseUpload;
    const client = createClient();
    client.uploadCv.mockImplementation(
      () => new Promise((resolve) => (releaseUpload = resolve))
    );
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
      />
    );
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit application" }));

    expect(screen.getByRole("button", { name: "Uploading CV" })).toBeDisabled();
    releaseUpload();
    await waitFor(() => expect(client.submitApplication).toHaveBeenCalled());
  });

  test("focuses a server error summary", async () => {
    const user = userEvent.setup();
    const client = createClient();
    client.submitApplication.mockRejectedValue({ code: "CAMPAIGN_UNAVAILABLE" });
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
      />
    );
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit application" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/application link is no longer available/i);
  });

  test("submits from the keyboard and clears preserved fields on success", async () => {
    const user = userEvent.setup();
    const client = createClient();
    const onSubmitted = vi.fn();
    render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
        onSubmitted={onSubmitted}
      />
    );
    await fillForm(user);
    screen.getByLabelText("Full name").focus();

    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(onSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({ applicationReference: "AUR-1" })
      )
    );
    expect(sessionStorage.getItem("auralis:hiring:application")).toBeNull();
  });

  test("submits an empty hidden website field for server-side bot screening", async () => {
    const user = userEvent.setup();
    const client = createClient();
    const { container } = render(
      <ApplicationForm
        role={designRole}
        campaign={campaign}
        client={client}
      />
    );
    const honeypot = container.querySelector('input[name="website"]');

    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Submit application" }));

    await waitFor(() => expect(client.submitApplication).toHaveBeenCalled());
    expect(client.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ website: "" })
    );
    expect(client.submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({ website: "" }),
      expect.any(String)
    );
  });

  test("lets a direct applicant choose a role without exposing a campaign token", async () => {
    const user = userEvent.setup();
    const client = createClient();
    const onRoleChange = vi.fn();
    render(
      <ApplicationForm
        roles={[designRole, getRoleBySlug("senior-ai-product-engineer")]}
        client={client}
        onRoleChange={onRoleChange}
      />
    );

    await user.selectOptions(screen.getByLabelText("Role"), designRole.slug);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Submit application" }));

    await waitFor(() => expect(client.submitApplication).toHaveBeenCalled());
    expect(onRoleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: designRole.slug })
    );
    expect(client.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ roleSlug: designRole.slug })
    );
    const [submission] = client.submitApplication.mock.calls[0];
    expect(submission.roleSlug).toBe(designRole.slug);
    expect(submission).not.toHaveProperty("campaignToken");
  });
});
