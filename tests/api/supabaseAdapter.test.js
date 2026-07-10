import { expect, test, vi } from "vitest";
import { createSupabaseAdmin } from "../../api/_lib/adapters/supabase.js";

test("creates a server-only non-persistent Supabase client", () => {
  const client = {};
  const createClientImpl = vi.fn(() => client);

  const result = createSupabaseAdmin(
    {
      SUPABASE_URL: "https://project-ref.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret"
    },
    createClientImpl
  );

  expect(result).toBe(client);
  expect(createClientImpl).toHaveBeenCalledWith(
    "https://project-ref.supabase.co",
    "service-role-secret",
    expect.objectContaining({
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    })
  );
});
