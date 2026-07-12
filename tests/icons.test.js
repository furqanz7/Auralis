import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const htmlFiles = ["index.html", "support.html", "terms.html", "privacy.html"];
const iconFiles = [
  ["public/assets/auralis-crystal-favicon-32.png", 32],
  ["public/assets/auralis-crystal-touch-180.png", 180],
  ["public/assets/auralis-crystal-icon-192.png", 192],
  ["public/assets/auralis-crystal-icon-512.png", 512]
];

describe("Auralis crystal icons", () => {
  test.each(iconFiles)("%s is a square PNG at the declared size", async (path, size) => {
    const image = await readFile(resolve(root, path));
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.readUInt32BE(16)).toBe(size);
    expect(image.readUInt32BE(20)).toBe(size);
  });

  test.each(htmlFiles)("%s references the new browser and Apple icons", async (path) => {
    const source = await readFile(resolve(root, path), "utf8");
    expect(source).toContain(
      '<link rel="icon" type="image/png" sizes="32x32" href="/assets/auralis-crystal-favicon-32.png">'
    );
    expect(source).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/assets/auralis-crystal-touch-180.png">'
    );
  });

  test("web manifest declares the crystal application icons", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "public/site.webmanifest"), "utf8")
    );
    expect(manifest.icons).toEqual([
      {
        src: "/assets/auralis-crystal-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/assets/auralis-crystal-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      }
    ]);
  });
});
