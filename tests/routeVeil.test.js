import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();
let styles;
let entrypoint;

beforeAll(async () => {
  [styles, entrypoint] = await Promise.all([
    readFile(resolve(root, "src/styles.css"), "utf8"),
    readFile(resolve(root, "src/main.jsx"), "utf8")
  ]);
});

describe("route transition veil", () => {
  test("is hidden below mobile browser chrome while idle", () => {
    expect(styles).toMatch(
      /\.route-veil\s*\{[^}]*visibility:\s*hidden;[^}]*\}/s
    );
    expect(styles).toMatch(
      /\.route-veil\.is-active\s*\{[^}]*visibility:\s*visible;[^}]*\}/s
    );
  });

  test("is only made visible for the duration of a route transition", () => {
    expect(entrypoint).toContain('veil.classList.add("is-active")');
    expect(entrypoint).toContain('veil.classList.remove("is-active")');
  });
});
