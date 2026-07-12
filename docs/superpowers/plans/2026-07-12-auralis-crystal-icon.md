# Auralis Crystal Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old browser and device icon artwork with approved crystal-derived PNG assets without changing any visible Auralis wordmark.

**Architecture:** Generate four deterministic square PNG derivatives from one centered crop of the approved 1024 x 1024 JPEG. Static HTML entry points reference the favicon and Apple touch icon directly, while the web manifest references dedicated 192 x 192 and 512 x 512 assets.

**Tech Stack:** Vite static HTML entry points, JSON web manifest, Node.js/Vitest, macOS `sips` image processing.

## Global Constraints

- Preserve the artwork's monochrome crystal, glow, rings, and black background.
- Do not redraw, recolor, sharpen, or add typography.
- Keep every visible Auralis wordmark and all page layouts unchanged.
- Use new asset filenames to avoid stale browser icon caches.

---

### Task 1: Generate And Integrate Crystal Icons

**Files:**
- Create: `public/assets/auralis-crystal-favicon-32.png`
- Create: `public/assets/auralis-crystal-touch-180.png`
- Create: `public/assets/auralis-crystal-icon-192.png`
- Create: `public/assets/auralis-crystal-icon-512.png`
- Create: `tests/icons.test.js`
- Modify: `index.html`
- Modify: `support.html`
- Modify: `terms.html`
- Modify: `privacy.html`
- Modify: `public/site.webmanifest`

**Interfaces:**
- Consumes: `/Users/Furqan/Downloads/IMG_2127 2.JPG`, a 1024 x 1024 RGB JPEG.
- Produces: browser icon URLs under `/assets/auralis-crystal-*.png` with exact 32, 180, 192, and 512 pixel square dimensions.

- [ ] **Step 1: Write the failing icon contract test**

Create `tests/icons.test.js`:

```js
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
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- tests/icons.test.js`

Expected: FAIL because the crystal PNG files and new HTML references do not exist yet.

- [ ] **Step 3: Generate deterministic PNG derivatives**

Run these commands from the repository root:

```bash
sips --cropToHeightWidth 832 832 --setProperty format png "/Users/Furqan/Downloads/IMG_2127 2.JPG" --out /tmp/auralis-crystal-crop.png
sips --resampleHeightWidth 32 32 /tmp/auralis-crystal-crop.png --out public/assets/auralis-crystal-favicon-32.png
sips --resampleHeightWidth 180 180 /tmp/auralis-crystal-crop.png --out public/assets/auralis-crystal-touch-180.png
sips --resampleHeightWidth 192 192 /tmp/auralis-crystal-crop.png --out public/assets/auralis-crystal-icon-192.png
sips --resampleHeightWidth 512 512 /tmp/auralis-crystal-crop.png --out public/assets/auralis-crystal-icon-512.png
```

Expected: four PNG files with the exact dimensions encoded in their filenames.

- [ ] **Step 4: Wire the favicon and Apple touch icon into every HTML entry point**

In each of `index.html`, `support.html`, `terms.html`, and `privacy.html`, replace the old Apple icon link and add the favicon link:

```html
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/auralis-crystal-favicon-32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/auralis-crystal-touch-180.png">
    <link rel="manifest" href="/site.webmanifest">
```

- [ ] **Step 5: Replace the old manifest icon definition**

Set `icons` in `public/site.webmanifest` to:

```json
  "icons": [
    {
      "src": "/assets/auralis-crystal-icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/assets/auralis-crystal-icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ]
```

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npm test -- tests/icons.test.js
npm test
npm run build
git diff --check
```

Expected: the icon contract passes, the complete suite passes, the production build succeeds, and `git diff --check` prints no output.

- [ ] **Step 7: Commit the implementation**

```bash
git add index.html support.html terms.html privacy.html public/site.webmanifest public/assets/auralis-crystal-*.png tests/icons.test.js
git commit -m "feat: add Auralis crystal favicon"
```

- [ ] **Step 8: Deploy and verify production asset responses**

Run:

```bash
git push origin main
npx vercel --prod --yes
curl -I https://auralis-nine.vercel.app/assets/auralis-crystal-favicon-32.png
curl -I https://auralis-nine.vercel.app/assets/auralis-crystal-touch-180.png
```

Expected: deployment reaches `READY`, the production alias is `https://auralis-nine.vercel.app`, and both asset requests return HTTP 200 with `content-type: image/png`.
