import { expect, test, vi } from "vitest";
import { createLiveEmailClient } from "../../api/_lib/liveEmailClient.js";

test("creates a Resend client with the server-only API key", () => {
  const ResendClient = vi.fn();
  const client = createLiveEmailClient(
    { RESEND_API_KEY: "re_server_only_key" },
    ResendClient
  );

  expect(ResendClient).toHaveBeenCalledWith("re_server_only_key");
  expect(client).toBeInstanceOf(ResendClient);
});
