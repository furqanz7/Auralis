import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

async function readConfig() {
  const source = await readFile(resolve(process.cwd(), "vercel.json"), "utf8");
  return JSON.parse(source);
}

function headerMap(rule) {
  return Object.fromEntries(
    (rule?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value])
  );
}

describe("Vercel private assessment routing", () => {
  test("rewrites the private Instagram application link to the SPA", async () => {
    const config = await readConfig();

    expect(config.rewrites).toContainEqual({
      source: "/apply/:path*",
      destination: "/index.html"
    });
  });

  test.each([
    "/apply/(.*)",
    "/api/campaigns/(.*)",
    "/api/applications",
    "/api/applications/(.*)",
    "/api/recruiter/(.*)"
  ])("keeps the private application surface %s uncached", async (source) => {
    const config = await readConfig();
    const headers = headerMap(
      config.headers.find((candidate) => candidate.source === source)
    );

    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("rewrites direct assessment links to the SPA", async () => {
    const config = await readConfig();

    expect(config.rewrites).toContainEqual({
      source: "/assessment/:path*",
      destination: "/index.html"
    });
  });

  test.each(["/assessment/(.*)", "/api/assessments/(.*)"])(
    "keeps %s private and uncached",
    async (source) => {
      const config = await readConfig();
      const headers = headerMap(
        config.headers.find((candidate) => candidate.source === source)
      );

      expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(headers["cache-control"]).toBe("no-store");
      expect(headers["x-content-type-options"]).toBe("nosniff");
    }
  );

  test("does not schedule automatic assessment reminder delivery", async () => {
    const config = await readConfig();

    expect(config.crons).not.toContainEqual({
      path: "/api/cron/assessment-reminders",
      schedule: "0 * * * *"
    });
  });

  test("rewrites private verification and completion links to the SPA", async () => {
    const config = await readConfig();

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/verify/:path*", destination: "/index.html" },
        { source: "/application/:path*", destination: "/index.html" }
      ])
    );
  });

  test.each([
    "/verify/(.*)",
    "/application/(.*)",
    "/api/verifications/(.*)",
    "/api/payments/tbc/callback"
  ])("keeps %s private and uncached", async (source) => {
    const config = await readConfig();
    const headers = headerMap(
      config.headers.find((candidate) => candidate.source === source)
    );

    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("runs fallback verification cancellation retry daily", async () => {
    const config = await readConfig();

    expect(config.crons).toContainEqual({
      path: "/api/cron/verification-retries",
      schedule: "0 0 * * *"
    });
  });

  test("rewrites tokenized privacy links and keeps privacy APIs private", async () => {
    const config = await readConfig();

    expect(config.rewrites).toContainEqual({
      source: "/privacy/delete/:path*",
      destination: "/privacy.html"
    });
    for (const source of ["/privacy/delete/(.*)", "/api/privacy/(.*)"]) {
      const headers = headerMap(
        config.headers.find((candidate) => candidate.source === source)
      );
      expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(headers["cache-control"]).toBe("no-store");
      expect(headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("runs privacy retention once per day", async () => {
    const config = await readConfig();

    expect(config.crons).toContainEqual({
      path: "/api/cron/hiring-retention",
      schedule: "30 2 * * *"
    });
  });
});
