import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

async function readConfig() {
  const source = await readFile(resolve(process.cwd(), "vercel.json"), "utf8");
  return JSON.parse(source);
}

async function listFunctionFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFunctionFiles(path, root)));
    } else if (entry.name.endsWith(".js")) {
      files.push(relative(root, path));
    }
  }
  return files;
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
      destination: "/"
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
      destination: "/"
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

  test("fits the Vercel Hobby function limit", async () => {
    const functions = await listFunctionFiles(resolve(process.cwd(), "api"));

    expect(functions).not.toContain("cron/assessment-reminders.js");
    expect(functions).toHaveLength(12);
  });

  test("routes every assessment operation through one function", async () => {
    const config = await readConfig();

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/api/assessments/:token/answers/:questionId",
          destination:
            "/api/assessments?token=:token&action=answer&questionId=:questionId"
        },
        {
          source: "/api/assessments/:token/start",
          destination: "/api/assessments?token=:token&action=start"
        },
        {
          source: "/api/assessments/:token/submit",
          destination: "/api/assessments?token=:token&action=submit"
        },
        {
          source: "/api/assessments/:token",
          destination: "/api/assessments?token=:token&action=read"
        }
      ])
    );
  });

  test("rewrites private verification and completion links to the SPA", async () => {
    const config = await readConfig();

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/verify/:path*", destination: "/" },
        { source: "/application/:path*", destination: "/" }
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
      destination: "/privacy"
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
