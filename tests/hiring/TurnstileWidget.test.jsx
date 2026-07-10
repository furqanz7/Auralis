import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import TurnstileWidget from "../../src/hiring/components/TurnstileWidget.jsx";

test("renders a scoped Turnstile challenge and returns its browser token", async () => {
  const onToken = vi.fn();
  const renderChallenge = vi.fn((element, options) => {
    options.callback("turnstile-browser-token");
    return "widget-id";
  });
  const remove = vi.fn();

  render(
    <TurnstileWidget
      siteKey="public-site-key"
      onToken={onToken}
      turnstileApi={{ render: renderChallenge, remove }}
    />
  );

  expect(screen.getByLabelText("Security verification")).toBeVisible();
  await waitFor(() =>
    expect(renderChallenge).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        sitekey: "public-site-key",
        action: "hiring_application",
        theme: "dark"
      })
    )
  );
  expect(onToken).toHaveBeenCalledWith("turnstile-browser-token");
});
