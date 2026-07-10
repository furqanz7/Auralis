# Auralis Cinematic Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Auralis landing page around the approved cinematic noir visual system, including a performant desktop cursor layer and responsive section layouts.

**Architecture:** Keep `src/App.jsx` as the page composition layer and retain the existing content arrays and service selection state. Add a focused `PointerSystem` client component for all per-pointer DOM updates, replace the obsolete Three.js hero with the generated static material artwork, and rebuild the visual styling through semantic component classes in `src/styles.css`.

**Tech Stack:** React 19, Vite 7, Framer Motion, Lucide React, CSS, built-in Browser QA.

## Global Constraints

- Preserve the existing copy, navigation targets, mail link, and service-tab interaction.
- Use `public/assets/auralis-obsidian-hero.png` as the hero image.
- Use only obsidian, porcelain, arterial red, chartreuse signal, and restrained mineral gold as prominent colors.
- Do not use the current pastel rainbow palette, glassmorphism panels, pill navigation, or Three.js hero overlay.
- Keep the Auralis wordmark component isolated; its final type treatment is explicitly deferred.
- The workspace has no Git repository, so do not include commit commands in execution.

---

### Task 1: Establish the cinematic visual foundation

**Files:**
- Modify: `src/content.js`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Consume: `public/assets/auralis-obsidian-hero.png`

**Interfaces:**
- Consumes: current `projects` and `services` object arrays with `accent` fields.
- Produces: a hero that references `/assets/auralis-obsidian-hero.png` and visual state accents limited to the approved palette.

- [ ] **Step 1: Update the content accent constants**

Replace the pastel values in the four service entries and three project entries with the approved palette values:

```js
const palette = ["#ed3b31", "#c8ff24", "#f5f0e8", "#b99048"];
```

Assign the entries from this set only; leave all existing labels and body copy unchanged.

- [ ] **Step 2: Replace the hero media composition**

Remove the lazy Three.js scene imports and `DeferredScene` helper from `src/App.jsx`. Render the hero media as:

```jsx
<div className="hero-media" aria-hidden="true">
  <img src="/assets/auralis-obsidian-hero.png" alt="" />
  <span className="hero-media-grid" />
</div>
```

Retain the hero copy, CTAs, and proof items. Replace the old `signal-panel` with a small semantic `hero-signal` block that contains one short material note and static coordinate text.

- [ ] **Step 3: Replace the existing style system**

Set base tokens in `src/styles.css`:

```css
:root {
  --ink: #070708;
  --porcelain: #f5f0e8;
  --muted: rgba(245, 240, 232, 0.62);
  --line: rgba(245, 240, 232, 0.18);
  --red: #ed3b31;
  --signal: #c8ff24;
  --gold: #b99048;
}
```

Rebuild nav, hero, section rails, services, workflow, work, contact, footer, and media queries with square or near-square framing and hairline separators. Avoid pastel gradients and translucent frosted panels.

- [ ] **Step 4: Build the static surface**

Run:

```bash
npm run build
```

Expected: Vite completes and writes `dist/` without unresolved asset or import errors.

### Task 2: Add the desktop pointer interaction layer

**Files:**
- Create: `src/PointerSystem.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `PointerSystem`, a zero-prop React component that renders `cursor-ring`, `cursor-dot`, and `cursor-label` visual elements.
- Consumes: elements annotated with `data-cursor-label` in `src/App.jsx`.

- [ ] **Step 1: Create the pointer component**

Create `src/PointerSystem.jsx` with refs for the ring, dot, and label. Attach `pointermove`, `pointerover`, `pointerout`, and `pointerleave` listeners in `useEffect`. Use a requestAnimationFrame callback to set `style.transform` on refs; never call `setState` for pointer coordinates.

```jsx
const target = event.target.closest("[data-cursor-label]");
labelRef.current.textContent = target?.dataset.cursorLabel || "";
ringRef.current.classList.toggle("is-active", Boolean(target));
```

Return `null` when `matchMedia("(pointer: fine)")` is false or reduced motion is enabled.

- [ ] **Step 2: Annotate interactive targets**

Add `data-cursor-label="Start"` to the primary CTA, `data-cursor-label="Work"` to the secondary CTA, and `data-cursor-label="Open"` to every project CTA and service tab button.

- [ ] **Step 3: Style the layer**

Use fixed-position elements with `pointer-events: none`, high z-index, a thin porcelain ring, and a chartreuse center point. Hide the layer at `max-width: 820px` and in the reduced-motion media query.

- [ ] **Step 4: Smoke-test the interaction**

In the Browser, move over a CTA and a service button. Expected: the ring changes scale or label without moving page content, and the native page links remain clickable.

### Task 3: Make section rhythm and project frames feel alive

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `Reveal`, `services`, `workflow`, `projects`, and contact link data.
- Produces: editorial section layouts that preserve all current interactions and remain responsive.

- [ ] **Step 1: Normalize reveal motion**

Set `Reveal` to begin at `{ opacity: 0, y: 24 }` and enter at `{ opacity: 1, y: 0 }`, using a 0.75 second custom ease and a `viewport` with `once: true`.

- [ ] **Step 2: Reframe services and workflow**

Use rail borders, section numerals, and an active service detail region that changes accent color. Keep the existing selected service state and detail lists intact. Give workflow steps a shared horizontal line only on desktop and stack them on mobile.

- [ ] **Step 3: Rebuild project visual treatment**

Keep the three cards but make their media regions large, image-led editorial frames. Use each project’s accent for one internal rule and an icon focal point; preserve the existing project copy and contact links.

- [ ] **Step 4: Rework the contact close**

Use the obsidian material artwork as a dark, low-opacity background crop and set the mail CTA as a direct underlined action. Keep the existing mailto and deck hrefs.

- [ ] **Step 5: Build after section changes**

Run:

```bash
npm run build
```

Expected: Vite production build passes.

### Task 4: Validate the rendered experience

**Files:**
- No source files required unless validation finds an issue.

**Interfaces:**
- Consumes: local Vite development server at `http://127.0.0.1:5173/`.
- Produces: desktop and mobile browser evidence for page identity, visual rendering, console health, and one interactive service/cursor flow.

- [ ] **Step 1: Validate the desktop first viewport**

Navigate to `http://127.0.0.1:5173/`, collect a DOM snapshot, console warning/error list, and a viewport screenshot.

Expected: Auralis navigation, hero headline, image, actions, and services are visible with no Vite error overlay.

- [ ] **Step 2: Exercise a service tab**

Click the `AI interfaces` service button and confirm the detail heading changes to `AI interfaces`.

- [ ] **Step 3: Validate mobile behavior**

Set a mobile viewport, reload, and capture a screenshot.

Expected: nav, heading, CTAs, and first service remain readable; custom cursor UI is absent.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit code 0.
