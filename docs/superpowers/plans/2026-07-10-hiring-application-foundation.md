# Auralis Hiring Phase 1: Application Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private role campaign routes, the approved application UI, private PDF upload, application persistence, and immediate candidate/recruiter email dispatch.

**Architecture:** React Router adds isolated hiring routes without disturbing the marketing homepage. Vercel Functions validate campaign access and application mutations. Service interfaces keep Supabase, Resend, and Turnstile replaceable so tests run against deterministic in-memory adapters.

**Tech Stack:** React 19, Vite 7, React Router, Vercel Functions, Supabase, Resend, Cloudflare Turnstile, Zod, Vitest, Testing Library.

## Global Constraints

Apply every constraint from `docs/superpowers/plans/2026-07-10-private-contractor-hiring.md`. Use the Supabase skill before implementing database or storage code. Use test-driven development for every behavior below.

## File Map

- `src/routes/AppRoutes.jsx`: marketing and private-hiring route composition.
- `src/hiring/pages/PrivateApplicationPage.jsx`: role context and application workflow.
- `src/hiring/components/ApplicationForm.jsx`: accessible fields, PDF upload, validation, and submission.
- `src/hiring/api/hiringClient.js`: browser API boundary.
- `src/hiring/styles.css`: hiring-screen tokens and responsive application layout.
- `shared/hiring/roles.js`: six role definitions shared by browser and functions.
- `shared/hiring/applicationSchema.js`: Zod application contract.
- `api/_lib/applicationService.js`: application use-case orchestration.
- `api/_lib/adapters/*.js`: provider contracts and live/test implementations.
- `api/campaigns/[roleSlug]/[campaignToken].js`: campaign validation endpoint.
- `api/applications/upload-url.js`: signed PDF upload endpoint.
- `api/applications/index.js`: application creation endpoint.
- `api/recruiter/cv/[token].js`: recruiter token exchange for a five-minute signed CV URL.
- `supabase/migrations/202607100001_hiring_application.sql`: Phase 1 tables and policies.
- `tests/`: unit, component, and handler tests matching the files above.

---

### Task 1: Add the test runner and route shell

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`
- Create: `tests/routes.test.jsx`
- Create: `src/routes/AppRoutes.jsx`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `AppRoutes()` and a browser-level `BrowserRouter` wrapper.
- Preserves: the existing marketing homepage at `/`.

- [ ] **Step 1: Install the route and test dependencies**

Run:

```bash
npm install react-router-dom zod @supabase/supabase-js resend
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "vitest run tests/e2e"
}
```

- [ ] **Step 2: Configure Vitest**

```js
// vitest.config.js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    restoreMocks: true
  }
});
```

```js
// tests/setup.js
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write the failing route test**

```jsx
// tests/routes.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/routes/AppRoutes.jsx";

test("renders the private application route without the public site navigation", () => {
  render(
    <MemoryRouter initialEntries={["/apply/senior-ai-product-engineer/demo-campaign"]}>
      <AppRoutes />
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { name: "Private application" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Site" })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the test and verify RED**

Run: `npm run test -- tests/routes.test.jsx`

Expected: FAIL because `src/routes/AppRoutes.jsx` and the private page do not exist.

- [ ] **Step 5: Implement the minimal route shell**

Create `PrivateApplicationPage.jsx` with only the semantic page heading needed by the test, then compose routes:

```jsx
// src/routes/AppRoutes.jsx
import { Route, Routes } from "react-router-dom";
import { HomePage } from "../App.jsx";
import PrivateApplicationPage from "../hiring/pages/PrivateApplicationPage.jsx";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/apply/:roleSlug/:campaignToken" element={<PrivateApplicationPage />} />
    </Routes>
  );
}
```

Wrap `AppRoutes` with `BrowserRouter` in `src/main.jsx`, and export `HomePage` from `src/App.jsx` while keeping `App` as the route composition entry.

- [ ] **Step 6: Run the route test and full build**

Run:

```bash
npm run test -- tests/routes.test.jsx
npm run build
```

Expected: route test PASS; build exits `0`; homepage remains available at `/`.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `test: add hiring route and test foundation`

---

### Task 2: Define the six role contracts

**Files:**
- Create: `shared/hiring/roles.js`
- Create: `shared/hiring/applicationSchema.js`
- Create: `tests/shared/roles.test.js`
- Create: `tests/shared/applicationSchema.test.js`

**Interfaces:**
- Produces: `ROLE_CONFIG`, `getRoleBySlug(slug)`, `applicationSchema`, `AVAILABILITY_OPTIONS`.
- Consumed by: route loader, application UI, application API, assessment phase.

- [ ] **Step 1: Write failing role-contract tests**

```js
import { describe, expect, test } from "vitest";
import { ROLE_CONFIG, getRoleBySlug } from "../../shared/hiring/roles.js";

describe("ROLE_CONFIG", () => {
  test("contains six unique senior contractor roles", () => {
    expect(ROLE_CONFIG).toHaveLength(6);
    expect(new Set(ROLE_CONFIG.map((role) => role.slug)).size).toBe(6);
    expect(ROLE_CONFIG.every((role) => role.engagement === "Independent contractor")).toBe(true);
  });

  test("exposes the approved AI role band", () => {
    expect(getRoleBySlug("senior-ai-product-engineer")).toMatchObject({
      rateMin: 85,
      rateMax: 120,
      currency: "EUR"
    });
  });
});
```

Add schema tests for valid email, URL, country, time zone, availability, storage object key, consent, and rejection of files other than PDF or larger than 5 MB.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/shared`

Expected: FAIL because the shared contracts do not exist.

- [ ] **Step 3: Implement the role definitions**

Use these exact slugs and bands:

```js
export const ROLE_CONFIG = [
  { slug: "senior-ai-product-engineer", title: "Senior AI Product Engineer", rateMin: 85, rateMax: 120, portfolioRequired: false },
  { slug: "senior-creative-frontend-developer", title: "Senior Creative Frontend Developer", rateMin: 65, rateMax: 95, portfolioRequired: true },
  { slug: "senior-full-stack-product-engineer", title: "Senior Full-Stack Product Engineer", rateMin: 70, rateMax: 105, portfolioRequired: false },
  { slug: "senior-product-designer", title: "Senior Product Designer", rateMin: 60, rateMax: 90, portfolioRequired: true },
  { slug: "senior-brand-visual-systems-designer", title: "Senior Brand and Visual Systems Designer", rateMin: 55, rateMax: 85, portfolioRequired: true },
  { slug: "senior-product-strategy-delivery-lead", title: "Senior Product Strategy and Delivery Lead", rateMin: 80, rateMax: 115, portfolioRequired: false }
].map((role) => ({
  ...role,
  currency: "EUR",
  engagement: "Independent contractor",
  location: "Remote worldwide"
}));

export function getRoleBySlug(slug) {
  return ROLE_CONFIG.find((role) => role.slug === slug) ?? null;
}
```

Implement the Zod schema with `fullName`, `email`, `country`, `timeZone`, `profileUrl`, `availability`, `cvObjectKey`, `cvMimeType`, `cvSize`, and `privacyAccepted`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm run test -- tests/shared`

Expected: all shared-contract tests PASS.

- [ ] **Step 5: Record checkpoint**

Intended commit when Git exists: `feat: define contractor role and application contracts`

---

### Task 3: Create the Phase 1 Supabase schema and secure token utilities

**Files:**
- Create: `supabase/migrations/202607100001_hiring_application.sql`
- Create: `api/_lib/env.js`
- Create: `api/_lib/adapters/supabase.js`
- Create: `api/_lib/tokens.js`
- Create: `tests/api/tokens.test.js`
- Create: `tests/api/applicationMigration.test.js`

**Interfaces:**
- Produces: `hashToken(token)`, `createOpaqueToken(bytes)`, `safeEqualHash(a, b)`, `getSupabaseAdmin()`.
- Database tables: `hiring_roles`, `hiring_campaigns`, `hiring_applications`, `hiring_email_events`, `hiring_access_tokens`.

- [ ] **Step 1: Write failing token tests**

```js
import { expect, test } from "vitest";
import { createOpaqueToken, hashToken, safeEqualHash } from "../../api/_lib/tokens.js";

test("creates opaque one-way tokens", () => {
  const token = createOpaqueToken(32);
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(hashToken(token)).not.toContain(token);
  expect(safeEqualHash(hashToken(token), hashToken(token))).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/tokens.test.js`

Expected: FAIL because token utilities do not exist.

- [ ] **Step 3: Implement token utilities and environment validation**

Use `node:crypto` `randomBytes`, `createHash("sha256")`, and `timingSafeEqual`. Validate server-only variables with Zod and never read service credentials from `import.meta.env`.

- [ ] **Step 4: Write the migration**

The migration must:

- enable `pgcrypto`;
- use UUID primary keys with `gen_random_uuid()`;
- make candidate email `citext` or compare normalized lowercase values;
- keep `cv_object_key` private;
- add unique idempotency keys;
- index application lifecycle state, deletion deadline, campaign, role, and normalized email;
- enable RLS on every hiring table;
- create no public policies, because only the server service role may access hiring data;
- add `created_at` and `updated_at` timestamps;
- constrain lifecycle state to the states in the approved specification.

Add a migration text test that checks for RLS, the expected table names, the unique idempotency constraint, and the 180-day deletion field.

- [ ] **Step 5: Run Phase 1 schema tests**

Run: `npm run test -- tests/api/tokens.test.js tests/api/applicationMigration.test.js`

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add secure hiring application schema`

---

### Task 4: Implement application upload and submission services

**Files:**
- Create: `api/_lib/adapters/contracts.js`
- Create: `api/_lib/adapters/resendEmail.js`
- Create: `api/_lib/adapters/turnstile.js`
- Create: `api/_lib/applicationService.js`
- Create: `api/_lib/http.js`
- Create: `api/campaigns/[roleSlug]/[campaignToken].js`
- Create: `api/applications/upload-url.js`
- Create: `api/applications/index.js`
- Create: `api/recruiter/cv/[token].js`
- Create: `tests/api/applicationService.test.js`
- Create: `tests/api/applicationHandlers.test.js`

**Interfaces:**
- `createApplicationService({ repository, storage, email, turnstile, clock })`.
- `service.validateCampaign({ roleSlug, campaignToken })`.
- `service.createUploadUrl({ campaignId, email, fileName, mimeType, size })`.
- `service.submitApplication({ idempotencyKey, campaignToken, payload, turnstileToken })`.
- `service.getRecruiterCv({ recruiterToken })` returns a five-minute signed download URL.
- Produces `{ applicationReference, assessmentDeliveryState }`.

- [ ] **Step 1: Write failing service tests with in-memory adapters**

Cover these exact behaviors:

1. Invalid campaign returns `CAMPAIGN_UNAVAILABLE` without exposing whether it was revoked or expired.
2. Non-PDF or file over 5 MB returns `INVALID_CV`.
3. Turnstile failure returns `ABUSE_CHECK_FAILED`.
4. A valid application creates one record, one candidate assessment email, and one recruiter email.
5. Repeating the same idempotency key returns the original application without duplicate email.
6. Same normalized email/role/campaign within 30 days reuses the existing application.
7. Recruiter email is dispatched even though assessment and payment are incomplete.
8. A valid 30-day recruiter token produces a five-minute signed CV URL; invalid, expired, or reused tokens return `CV_LINK_INVALID`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/applicationService.test.js`

Expected: FAIL because `createApplicationService` does not exist.

- [ ] **Step 3: Implement the minimal service**

Use dependency injection and return domain errors instead of provider errors:

```js
export function createApplicationService({ repository, storage, email, turnstile, clock }) {
  return {
    async submitApplication(input) {
      const existing = await repository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing.result;
      await turnstile.verify(input.turnstileToken);
      const application = await repository.createApplication(input, clock.now());
      await email.enqueueAssessmentInvite(application);
      await email.enqueueRecruiterApplication(application);
      return {
        applicationReference: application.reference,
        assessmentDeliveryState: "queued"
      };
    }
  };
}
```

Expand the implementation only to satisfy the eight tests. Provider adapters translate Supabase/Resend/Turnstile responses into the service contract. Store only the recruiter token hash and scope; the raw token appears only in the recruiter email.

- [ ] **Step 4: Implement thin HTTP handlers**

Handlers must enforce method, body-size limit, content type, Zod validation, `Idempotency-Key`, structured JSON errors, and `Cache-Control: no-store`. They must not contain business logic. The recruiter CV handler exchanges the token for a five-minute private-storage URL and responds with a `302` redirect only after validating HTTPS and the configured Supabase storage host.

- [ ] **Step 5: Run service and handler tests**

Run: `npm run test -- tests/api/applicationService.test.js tests/api/applicationHandlers.test.js`

Expected: PASS with no network access because tests use in-memory adapters.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add private application submission services`

---

### Task 5: Build the approved application interface

**Files:**
- Create: `src/hiring/api/hiringClient.js`
- Create: `src/hiring/components/ApplicationForm.jsx`
- Expand: `src/hiring/pages/PrivateApplicationPage.jsx`
- Create: `src/hiring/styles.css`
- Modify: `src/main.jsx`
- Create: `tests/hiring/ApplicationForm.test.jsx`
- Create: `tests/hiring/PrivateApplicationPage.test.jsx`

**Interfaces:**
- `createHiringClient(fetchImpl)` with `getCampaign`, `createUploadUrl`, and `submitApplication`.
- `ApplicationForm({ role, campaign, client, onSubmitted })`.
- `PrivateApplicationPage` reads `roleSlug` and `campaignToken` from route params.

- [ ] **Step 1: Write failing component tests**

Test persistent labels, required fields, PDF-only validation, 5 MB rejection, role-dependent profile URL requirement, keyboard submission, pending state, server error summary focus, and success navigation.

Example:

```jsx
test("rejects a non-PDF CV before requesting an upload URL", async () => {
  const client = { createUploadUrl: vi.fn() };
  render(<ApplicationForm role={designRole} campaign={campaign} client={client} />);
  const file = new File(["resume"], "resume.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  await userEvent.upload(screen.getByLabelText("CV / Resume"), file);
  expect(screen.getByText("Upload a PDF up to 5 MB.")).toBeInTheDocument();
  expect(client.createUploadUrl).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/hiring/ApplicationForm.test.jsx tests/hiring/PrivateApplicationPage.test.jsx`

Expected: FAIL because the full form and client do not exist.

- [ ] **Step 3: Implement the browser client and form state machine**

Use explicit states: `editing`, `uploading`, `submitting`, `submitted`, `error`. Generate a UUID idempotency key once per browser submission attempt. Preserve entered non-file fields in session storage until submission succeeds; never store the CV contents locally.

- [ ] **Step 4: Implement the approved visual composition**

Match `auralis-hiring-application.png`:

- full-width private header;
- left role/editorial column and right form column on desktop;
- no outer card or public navigation;
- ruled rectangular fields;
- `Auralis` in the approved display face;
- signal-lime underline on `Continue to review`;
- compact privacy notice;
- single-column mobile order: role context, then form;
- no element overlapping at 390, 768, 1280, 1440, or 2000 CSS pixels.

- [ ] **Step 5: Run component tests and build**

Run:

```bash
npm run test -- tests/hiring
npm run build
```

Expected: tests PASS; build exits `0`.

- [ ] **Step 6: Verify Phase 1 in Browser/IAB**

Use a test campaign adapter and verify:

1. Invalid campaign screen.
2. Successful PDF upload/application submission.
3. Duplicate submit does not create a second application.
4. Desktop and 390px mobile layouts match the approved concept.
5. No console errors, horizontal overflow, or text overlap.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `feat: ship private contractor application flow`
