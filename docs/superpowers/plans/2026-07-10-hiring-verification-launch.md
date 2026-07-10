# Auralis Hiring Phase 3: Hosted Verification and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TBC-hosted EUR 2.99 preauthorization/cancellation flow, approved handoff and completion screens, verification emails, retention/deletion, production configuration checks, and full-path responsive verification.

**Architecture:** A provider-neutral verification service creates a TBC hosted checkout session and persists its merchant/provider references. TBC owns all card UI. The callback triggers authoritative status lookup and idempotent cancellation; the browser return only polls Auralis state. Completion and recruiter emails occur from confirmed server state.

**Tech Stack:** Phase 1-2 stack plus TBC E-Commerce REST API, Vercel Cron retry/retention functions, provider-contract tests, and full-flow Browser/IAB verification.

## Global Constraints

Phases 1 and 2 must be green before this plan begins. Apply every constraint from `docs/superpowers/plans/2026-07-10-private-contractor-hiring.md`. Follow the payment skill's hosted-checkout guidance and use test-driven development for every payment transition.

## File Map

- `api/_lib/adapters/tbcPayment.js`: TBC access token, hosted session, status lookup, and cancellation.
- `api/_lib/verificationService.js`: provider-neutral verification state machine.
- `api/verifications/[token]/session.js`: hosted-session creation.
- `api/verifications/[token]/status.js`: browser-safe status lookup.
- `api/payments/tbc/callback.js`: TBC callback entry.
- `api/cron/verification-retries.js`: bounded persistent cancellation retry.
- `src/hiring/pages/VerificationPage.jsx`: approved hosted-portal handoff.
- `src/hiring/pages/ApplicationCompletePage.jsx`: approved completion state.
- `api/cron/hiring-retention.js`: 180-day purge.
- `api/privacy/delete-request.js`: candidate deletion request.
- `supabase/migrations/202607100003_hiring_verification.sql`: payment, retry, and deletion fields.
- `tests/e2e/hiringFlow.test.jsx`: deterministic end-to-end candidate path.

---

### Task 1: Define the payment adapter and test TBC requests

**Files:**
- Extend: `api/_lib/adapters/contracts.js`
- Create: `api/_lib/adapters/tbcPayment.js`
- Create: `tests/api/tbcPayment.test.js`

**Interfaces:**
- `createPaymentAdapter({ fetchImpl, apiKey, clientId, clientSecret, baseUrl })`.
- `createHostedSession({ merchantPaymentId, returnUrl, callbackUrl })` returns `{ providerPaymentId, approvalUrl, expiresAt }`.
- `getPayment(providerPaymentId)` returns normalized provider state.
- `cancelPayment(providerPaymentId)` returns normalized cancellation state.
- Fixed transaction: `amountMinor: 299`, `currency: "EUR"`, `preAuth: true`, `saveCard: false`.

- [ ] **Step 1: Write failing adapter tests**

Use a recording `fetchImpl` and test:

1. Access token request sends client ID/secret only to TBC.
2. Create payment sends exactly EUR 2.99, `preAuth: true`, `saveCard: false`, English, return URL, callback URL, merchant reference, and `Application verification` description.
3. Returned `approval_url` must be HTTPS and hosted by the configured TBC checkout host.
4. Status lookup maps provider states without treating the browser return as success.
5. Cancellation calls `POST /v1/tpay/payments/{payId}/cancel` once.
6. Provider error bodies are redacted before logging.
7. Card data is never accepted by any adapter method.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/tbcPayment.test.js`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement access-token and request helpers**

```js
export function createPaymentAdapter({ fetchImpl, apiKey, clientId, clientSecret, baseUrl }) {
  async function request(path, init = {}) {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        apikey: apiKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) throw normalizeProviderError(response);
    return response.json();
  }

  return { createHostedSession, getPayment, cancelPayment };
}
```

Cache an access token only until its provider expiry minus 60 seconds. Never persist client credentials or access tokens in the database.

- [ ] **Step 4: Implement hosted-session normalization**

Select the link with `rel === "approval_url"`; reject missing, non-HTTPS, or unexpected-host URLs. Do not pass payment method lists unless TBC merchant configuration requires one.

- [ ] **Step 5: Run adapter tests and verify GREEN**

Run: `npm run test -- tests/api/tbcPayment.test.js`

Expected: PASS with no external network calls.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add TBC hosted payment adapter`

---

### Task 2: Implement authoritative verification and cancellation state

**Files:**
- Create: `supabase/migrations/202607100003_hiring_verification.sql`
- Create: `api/_lib/verificationService.js`
- Extend: `api/_lib/adapters/supabase.js`
- Create: `tests/api/verificationService.test.js`
- Create: `tests/api/verificationMigration.test.js`

**Interfaces:**
- `createVerificationService({ repository, payment, email, clock })`.
- `createSession({ verificationToken, returnBaseUrl, idempotencyKey })` returns `{ approvalUrl }`.
- `handleCallback({ providerPaymentId })` returns `{ acknowledged: true }`.
- `getStatus({ verificationToken })` returns a browser-safe state.
- `retryCancellation(verificationId)` is idempotent.

- [ ] **Step 1: Write failing state-machine tests**

Cover:

1. Only `assessment_submitted` applications may create a session.
2. Session creation always uses EUR 2.99 and the application merchant reference.
3. Repeated idempotency keys return the same approval URL/reference.
4. Callback fetches provider state and verifies amount, currency, merchant reference, and preauthorization before cancellation.
5. Mismatched provider data moves to `verification_failed`, sends an operational alert, and never completes the application.
6. Successful cancel moves to `completed`, dispatches candidate completion and recruiter verification emails once.
7. Duplicate callback is acknowledged without duplicate cancel/email.
8. Temporary cancellation error moves to `verification_processing` and schedules retry.
9. Payment abandonment leaves the application reviewable at `verification_pending`.
10. Verification state never changes assessment score or recruiter priority.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/verificationService.test.js`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Write the migration**

Create `hiring_payment_verifications` with unique application ID, merchant reference, provider payment ID, amount/currency constraints, provider state, cancellation state, idempotency key, attempt count, next retry time, callback timestamps, redacted error category, and timestamps. Add a check constraint requiring `amount_minor = 299` and `currency = 'EUR'`. Enable RLS with no public policy.

Extend application lifecycle states with `verification_pending`, `verification_processing`, `verification_failed`, and `completed` if the Phase 1 check constraint requires migration.

- [ ] **Step 4: Implement the verification service**

Keep provider calls outside database transactions. Use compare-and-set repository methods for state changes so duplicate callbacks and cron retries cannot dispatch twice. Email event idempotency keys are `verification-complete:{applicationId}` and `verification-failed:{applicationId}`.

- [ ] **Step 5: Run service and migration tests**

Run: `npm run test -- tests/api/verificationService.test.js tests/api/verificationMigration.test.js`

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add authoritative verification state machine`

---

### Task 3: Add session, callback, status, and retry endpoints

**Files:**
- Create: `api/verifications/[token]/session.js`
- Create: `api/verifications/[token]/status.js`
- Create: `api/payments/tbc/callback.js`
- Create: `api/cron/verification-retries.js`
- Create: `tests/api/verificationHandlers.test.js`
- Modify: `vercel.json`

**Interfaces:**
- `POST /api/verifications/:token/session` with an idempotency key.
- `GET /api/verifications/:token/status`.
- `POST /api/payments/tbc/callback` with provider `PaymentId`.
- `POST /api/cron/verification-retries` authenticated by `CRON_SECRET`.

- [ ] **Step 1: Write failing handler tests**

Test method enforcement, token scope, no-store headers, approval URL response, callback body validation, provider status lookup, `200` acknowledgement for duplicate callback, unauthorized cron rejection, and bounded retry selection.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/verificationHandlers.test.js`

Expected: FAIL because the handlers do not exist.

- [ ] **Step 3: Implement thin handlers**

The callback accepts only a payment ID, immediately delegates to `handleCallback`, and returns `200` for any already-processed provider payment. It must not trust client cookies, query parameters, amount, status, or merchant reference.

- [ ] **Step 4: Add retry cron**

Run every five minutes. Select at most 20 due `verification_processing` rows with `FOR UPDATE SKIP LOCKED`, increment attempts atomically, and use retry delays of 1, 5, 15, 60, and 240 minutes. After the fifth failure, keep the application reviewable, mark operational failure, and alert `hello@auralis.studio`.

- [ ] **Step 5: Update Vercel routing and headers**

Add SPA rewrites for `/verify/*` and `/application/*/complete`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, and cron entries for verification retry and retention.

- [ ] **Step 6: Run handler tests**

Run: `npm run test -- tests/api/verificationHandlers.test.js`

Expected: PASS.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `feat: add hosted verification endpoints and retries`

---

### Task 4: Build the hosted-portal handoff and completion screens

**Files:**
- Create: `src/hiring/pages/VerificationPage.jsx`
- Create: `src/hiring/pages/ApplicationCompletePage.jsx`
- Create: `src/hiring/hooks/useVerificationStatus.js`
- Modify: `src/routes/AppRoutes.jsx`
- Extend: `src/hiring/api/hiringClient.js`
- Extend: `src/hiring/styles.css`
- Create: `tests/hiring/VerificationPage.test.jsx`
- Create: `tests/hiring/ApplicationCompletePage.test.jsx`
- Create: `tests/hiring/useVerificationStatus.test.jsx`

**Interfaces:**
- Routes: `/verify/:token` and `/application/:reference/complete/:returnToken`.
- `beginVerification()` redirects only to the API-returned HTTPS approval URL.
- Status values: `pending`, `processing`, `completed`, `failed`.

- [ ] **Step 1: Write failing UI tests**

Verify disclosure copy, absence of card fields, hosted-portal redirect, popup-free same-tab navigation, status polling, delayed-callback processing state, completed status rows, bank-release disclaimer, no score/pass/hiring promise, and keyboard operation.

```jsx
test("never renders card collection fields", () => {
  render(<VerificationPage client={testClient} />);
  expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue to payment portal" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/hiring/VerificationPage.test.jsx tests/hiring/ApplicationCompletePage.test.jsx tests/hiring/useVerificationStatus.test.jsx`

Expected: FAIL because the screens do not exist.

- [ ] **Step 3: Implement hosted redirect behavior**

On action, create a session with a stable idempotency key, validate the returned URL again in the browser, and navigate in the same tab. Disable the action while creating. On return, poll status with capped intervals until `completed`, `failed`, or two minutes, then switch to the processing state without claiming success.

- [ ] **Step 4: Implement approved verification composition**

Match `auralis-hiring-verification.png` exactly: explanation/status on the left, provider handoff summary and single action on the right, no card fields, no provider logo until TBC branding assets are contractually approved, and no ecommerce styling.

- [ ] **Step 5: Implement approved completion composition**

Match `auralis-hiring-completion.png`: editorial confirmation, three server-confirmed status rows, application reference, candidate email, bank-release note, what-happens-next copy, and one return action.

- [ ] **Step 6: Run UI tests and build**

Run:

```bash
npm run test -- tests/hiring/VerificationPage.test.jsx tests/hiring/ApplicationCompletePage.test.jsx tests/hiring/useVerificationStatus.test.jsx
npm run build
```

Expected: PASS and build exit `0`.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `feat: build hosted verification and completion screens`

---

### Task 5: Implement privacy deletion and 180-day retention

**Files:**
- Create: `api/privacy/delete-request.js`
- Create: `api/cron/hiring-retention.js`
- Extend: `api/_lib/adapters/supabase.js`
- Modify: `privacy.html`
- Create: `tests/api/hiringRetention.test.js`
- Create: `tests/api/privacyDelete.test.js`

**Interfaces:**
- Candidate deletion request issues an email-confirmed, scoped deletion token.
- `purgeExpiredApplications(now, limit)` deletes CV objects before PII rows and retains anonymized aggregate counts only.

- [ ] **Step 1: Write failing retention tests**

Test exact 180-day boundary, CV deletion before PII deletion, assessment response removal, payment metadata removal, token revocation, anonymized aggregate preservation, idempotent rerun, and no deletion before email confirmation for candidate-requested deletion.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/hiringRetention.test.js tests/api/privacyDelete.test.js`

Expected: FAIL because purge/deletion services do not exist.

- [ ] **Step 3: Implement deletion services and handlers**

Process a bounded batch, persist a deletion event without candidate PII, and retry storage failures rather than deleting the database reference first. Generic API responses must not disclose whether an email has an application.

- [ ] **Step 4: Update privacy notice**

Add hiring purpose, collected fields, providers, hosted payment boundary, 180-day retention, deletion method, international transfers, and explicit statement that no automated hiring decision is made.

- [ ] **Step 5: Run privacy tests**

Run: `npm run test -- tests/api/hiringRetention.test.js tests/api/privacyDelete.test.js`

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add candidate privacy and retention controls`

---

### Task 6: Add deterministic end-to-end flow and production readiness checks

**Files:**
- Create: `tests/e2e/hiringFlow.test.jsx`
- Create: `tests/e2e/paymentDelay.test.jsx`
- Create: `api/_lib/adapters/testProviders.js`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `vercel.json`

**Interfaces:**
- `HIRING_PROVIDER_MODE=test|live` selects deterministic adapters only outside production.
- Production environment validation fails closed if any live provider setting is missing.

- [ ] **Step 1: Write failing full-flow tests**

The primary test must:

1. Open a valid campaign.
2. Submit candidate fields and a PDF.
3. Assert recruiter application email was queued.
4. Open the single-use assessment link.
5. Answer and submit all 18 questions.
6. Assert recruiter assessment email was queued before verification.
7. Start hosted verification and simulate TBC approval.
8. Deliver callback twice.
9. Assert exactly one cancellation and one pair of completion emails.
10. Render the completed status without score or hiring promise.

The delay test must return from the provider before callback, show processing after two minutes, then move to complete when the callback arrives.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:e2e`

Expected: FAIL until the test-provider composition and final route wiring exist.

- [ ] **Step 3: Implement deterministic provider composition**

Use in-memory repository/storage/email/payment adapters with a fake clock. Test mode must be impossible in production:

```js
if (process.env.VERCEL_ENV === "production" && process.env.HIRING_PROVIDER_MODE !== "live") {
  throw new Error("Production hiring providers must run in live mode.");
}
```

- [ ] **Step 4: Document exact environment names**

`.env.example` lists names only:

```dotenv
PUBLIC_SITE_URL=
HIRING_PROVIDER_MODE=test
HIRING_TOKEN_SECRET=
HIRING_IP_HASH_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_CV_BUCKET=hiring-cvs
RESEND_API_KEY=
RESEND_FROM=Auralis Careers <careers@auralis.studio>
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TBC_BASE_URL=https://api.tbcbank.ge
TBC_CHECKOUT_HOST=tpay.tbcbank.ge
TBC_API_KEY=
TBC_CLIENT_ID=
TBC_CLIENT_SECRET=
CRON_SECRET=
```

README must include Supabase migration order, Resend DNS verification, TBC merchant/EUR/preauth activation, callback registration, Turnstile setup, local test mode, and production go-live checklist.

- [ ] **Step 5: Run complete automated verification**

Run:

```bash
npm run test
npm run test:e2e
npm run build
```

Expected: all tests PASS; build exits `0`; no warnings caused by application code.

- [ ] **Step 6: Perform visual and interaction verification**

Use Browser/IAB first. Capture the four implementation states at the approved concept's 16:10 desktop size and at 390x844 mobile. Use `view_image` on each approved concept and corresponding implementation screenshot. Record and fix mismatches in copy, layout, typography, palette, rules, asset crop, spacing, icons, focus, responsive order, and motion.

Verify:

- no public careers navigation or sitemap entry;
- no card fields in Auralis;
- no text overlap or horizontal overflow;
- all controls keyboard accessible;
- all four routes have noindex/no-store behavior;
- callback duplication is harmless;
- browser return cannot forge completion;
- application and assessment recruiter emails occur regardless of payment;
- Browser/IAB console has no errors or warnings.

- [ ] **Step 7: Record final checkpoint**

Intended commit when Git exists: `feat: launch private contractor hiring funnel`
