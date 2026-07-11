# Wise Payment Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an assessed applicant report a manual EUR 2.99 Wise payment, persist the report once, notify the recruiter once, and return a durable browser state without claiming provider verification.

**Architecture:** Add a focused Wise payment-report domain service behind the existing private verification token. Store reports in a service-role-only Supabase table, use atomic RPC notification claims for idempotent Resend delivery, expose one strict POST route, and extend the existing verification status response with a redacted report state. The React verification page owns the small report form and replaces the Wise controls with pending or reported states after submission.

**Tech Stack:** React 19, React Router, Vite 7, Vitest, Testing Library, Vercel Functions, Zod 4, Supabase Postgres/RPC, Resend.

## Global Constraints

- A payment report is an applicant assertion, never Wise confirmation.
- Payment reporting must not change assessment score, eligibility, review order, lifecycle state, or contractor selection.
- The server owns application identity, candidate details, role, amount `299`, and currency `EUR`.
- The browser may send only `payerName`; an empty body is accepted only to retry a previously persisted pending notification.
- Payer names are trimmed, Unicode-safe, single-line, and between 2 and 120 code points.
- No card, bank-account, Wise-login, receipt, transaction credential, or CV URL is collected or emailed.
- Recruiter notifications go only to `auralis.careers@proton.me` through the configured Resend adapter.
- Status responses never expose the stored payer name.
- Every private response keeps the existing `no-store` and `noindex` headers.
- The public UI must never use `successful`, `verified`, `confirmed`, `matched`, or `refunded` for a self-report.
- Desktop and mobile layouts must have no text overlap or horizontal overflow.

---

## File Structure

- `api/_lib/wisePaymentReportService.js`: payment-report validation, idempotent notification orchestration, and public response mapping.
- `api/_lib/wisePaymentReportRuntime.js`: live/test composition of repository and email dependencies.
- `api/verifications/[token]/payment-report.js`: strict private POST handler.
- `api/_lib/adapters/supabase.js`: Wise report row/claim mapping and RPC repository methods; existing verification status mapping gains `paymentReport`.
- `api/_lib/adapters/hiringEmail.js`: recruiter-only Wise report email with escaped values and stable idempotency key.
- `api/_lib/adapters/testProviders.js`: deterministic in-memory report repository and email event for end-to-end tests.
- `api/_lib/testHiringRuntime.js`: composes the report service for deterministic tests.
- `api/_lib/verificationHttp.js`: strict optional retry body schema.
- `api/_lib/verificationService.js`: redacted `paymentReport` status projection only.
- `api/_lib/verificationRuntime.js`: status remains backed by the expanded Supabase payload.
- `api/verifications/[token]/status.js`: unchanged handler contract, expanded service payload.
- `supabase/migrations/20260711103927_wise_payment_reports.sql`: table, constraints, status payload extension, atomic report/notification RPCs, RLS, and grants.
- `src/hiring/api/hiringClient.js`: `reportWisePayment(token, payerName?)` API call and demo state.
- `src/hiring/pages/VerificationPage.jsx`: applicant form, pending retry, and durable reported presentation.
- `src/hiring/styles.css`: responsive form and state styling within the existing verification layout.
- `src/hiring/pages/PrivacyPage.jsx`: payer name/report timestamp disclosure.
- `README.md`: operator reconciliation, reusable-link, notification, and refund checklist.
- `docs/superpowers/specs/2026-07-11-wise-payment-report-design.md`: mark approved and document bodyless pending retries.
- `tests/api/wisePaymentReportService.test.js`: domain behavior and failure recovery.
- `tests/api/wisePaymentReportMigration.test.js`: schema, RPC, RLS, and lifecycle invariants.
- `tests/api/wisePaymentReportHandlers.test.js`: route validation and private headers.
- `tests/api/wisePaymentReportRuntime.test.js`: dependency composition.
- `tests/api/supabaseVerificationRepository.test.js`: report and status RPC mapping.
- `tests/api/verificationService.test.js`: redacted public status states.
- `tests/api/hiringEmail.test.js`: exact recruiter message and HTML escaping.
- `tests/api/testRuntimeSelection.test.js`: deterministic report runtime selection.
- `tests/hiring/hiringClient.test.js`: encoded POST route and strict body.
- `tests/hiring/VerificationPage.test.jsx`: form, validation, pending retry, persisted reported state, and truthful language.
- `tests/e2e/wisePaymentReport.test.jsx`: assessment-to-report deterministic journey.

---

### Task 1: Payment Report Domain Service

**Files:**
- Create: `tests/api/wisePaymentReportService.test.js`
- Create: `api/_lib/wisePaymentReportService.js`

**Interfaces:**
- Consumes: repository methods `findByAccessTokenHash(tokenHash, now)`, `createAndClaim({ tokenHash, payerName, reportedAt })`, `claimNotification({ reportId, claimedAt })`, `markNotificationSent({ reportId, attemptNumber, sentAt })`, and `markNotificationFailed({ reportId, attemptNumber, errorCategory, failedAt })`; email method `enqueueWisePaymentReport({ application, paymentReport })`.
- Produces: `createWisePaymentReportService({ repository, email, clock })` with `reportPayment({ verificationToken, payerName }) -> { state, reportedAt }`; `WisePaymentReportDomainError` carrying `code` and `status`.

- [ ] **Step 1: Write failing service tests**

Create a fixture with a valid `assessment_submitted` application, no initial report, and spies for every repository/email call. Add tests that assert:

```js
await expect(service.reportPayment({
  verificationToken: VERIFICATION_TOKEN,
  payerName: "  Nino Beridze  "
})).resolves.toEqual({
  state: "reported",
  reportedAt: "2026-07-11T10:00:00.000Z"
});
expect(repository.createAndClaim).toHaveBeenCalledWith({
  tokenHash: hashToken(VERIFICATION_TOKEN),
  payerName: "Nino Beridze",
  reportedAt: new Date("2026-07-11T10:00:00.000Z")
});
expect(email.enqueueWisePaymentReport).toHaveBeenCalledTimes(1);
```

Also prove these separate behaviors: `Łukasz Żółć` and `ნინო ბერიძე` are accepted; blank, one-code-point, multiline/control-character, and 121-code-point names fail with `PAYMENT_REPORT_NAME_INVALID`/422 before persistence; missing name on a first report fails with `PAYMENT_REPORT_NAME_REQUIRED`/422; unknown, expired, deleted, and non-submitted records fail without storing/emailing; an already-notified report returns `reported` without another claim/email; a pending report can be retried with no payer name; a fresh in-progress duplicate returns `notification_pending` without another email; email failure persists `EMAIL_DELIVERY_FAILED` and returns `notification_pending`; retry success marks the same report sent; score, priority, and lifecycle state are unchanged.

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm test -- tests/api/wisePaymentReportService.test.js`

Expected: FAIL because `api/_lib/wisePaymentReportService.js` does not exist.

- [ ] **Step 3: Implement the minimal domain service**

Implement these exact exports and state rules:

```js
export class WisePaymentReportDomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "WisePaymentReportDomainError";
    this.code = code;
    this.status = status;
  }
}

export function createWisePaymentReportService({
  repository,
  email,
  clock = { now: () => new Date() }
}) {
  return {
    async reportPayment({ verificationToken, payerName }) {
      // Hash and resolve the private token, validate first-report names,
      // atomically create/claim, send one email, and persist sent/failure state.
    }
  };
}
```

Use `[...trimmed].length` for the 2–120 code-point boundary and `/[\p{Cc}\p{Cs}]/u` to reject controls/surrogates. Treat a report as `reported` only when `notificationSentAt` is present. Return ISO strings, never the payer name. On provider failure, store only `EMAIL_DELIVERY_FAILED`, not the provider error message.

- [ ] **Step 4: Run the service test and verify GREEN**

Run: `npm test -- tests/api/wisePaymentReportService.test.js`

Expected: all payment-report service tests PASS.

- [ ] **Step 5: Commit the domain service**

```bash
git add api/_lib/wisePaymentReportService.js tests/api/wisePaymentReportService.test.js
git commit -m "feat: add Wise payment report service"
```

---

### Task 2: Supabase Persistence And Atomic Notification Claims

**Files:**
- Create: `tests/api/wisePaymentReportMigration.test.js`
- Modify: `tests/api/supabaseVerificationRepository.test.js`
- Modify: `supabase/migrations/20260711103927_wise_payment_reports.sql`
- Modify: `api/_lib/adapters/supabase.js`

**Interfaces:**
- Consumes: existing `hiring_applications`, `hiring_access_tokens`, `hiring_roles`, `hiring_set_updated_at()`, `hiring_verification_payload()`, and `get_hiring_verification_by_token(text, timestamptz)` conventions.
- Produces: `createSupabaseWisePaymentReportRepository({ client })` with the five methods required by Task 1; `createSupabaseVerificationRepository(...).findByAccessTokenHash(...)` includes internal `paymentReport`; RPCs `create_hiring_wise_payment_report`, `claim_hiring_wise_payment_report_notification`, `mark_hiring_wise_payment_report_sent`, and `mark_hiring_wise_payment_report_failed`.

- [ ] **Step 1: Write failing migration and repository tests**

Assert the migration contains the table and fixed constraints:

```js
expect(sql).toContain("create table public.hiring_wise_payment_reports");
expect(sql).toContain("application_id uuid not null unique");
expect(sql).toContain("check (amount_minor = 299)");
expect(sql).toContain("check (currency = 'eur')");
expect(sql).toContain("on delete cascade");
expect(sql).toContain("enable row level security");
expect(sql).not.toMatch(/create\s+policy/i);
```

Assert every RPC revokes `public`, `anon`, and `authenticated`, then grants only `service_role`. Assert report creation validates the active `verification` token and `assessment_submitted` lifecycle, notification claims use `for update`, attempts are bounded, stale `NOTIFICATION_IN_PROGRESS` claims can be reclaimed after five minutes, and the migration never updates `hiring_applications.lifecycle_state`.

Extend repository tests with RPC payloads containing:

```js
payment_report: {
  id: "wise-report-1",
  application_id: "application-1",
  payer_name: "Nino Beridze",
  amount_minor: 299,
  currency: "EUR",
  reported_at: "2026-07-11T10:00:00.000Z",
  notification_sent_at: null,
  notification_attempt_count: 1,
  last_notification_error: "NOTIFICATION_IN_PROGRESS"
}
```

Prove dates are mapped to `Date`, claim metadata is mapped, and exact RPC argument names use ISO timestamps.

- [ ] **Step 2: Run persistence tests and verify RED**

Run: `npm test -- tests/api/wisePaymentReportMigration.test.js tests/api/supabaseVerificationRepository.test.js`

Expected: FAIL because the migration is empty and the Wise repository export is missing.

- [ ] **Step 3: Implement the migration**

Create `hiring_wise_payment_reports` with UUID primary key, unique cascading `application_id`, `payer_name` length/check constraints, fixed amount/currency, timestamps, attempt count `0..100`, and error category constrained to `NOTIFICATION_IN_PROGRESS` or `EMAIL_DELIVERY_FAILED`. Add the existing updated-at trigger.

Implement `hiring_wise_payment_report_payload(report_id)` returning all internal fields. Replace `get_hiring_verification_by_token` so its existing application/hosted-verification payload is preserved and a sibling `payment_report` key is always present.

Implement report creation so it:

```sql
select access_token.application_id
from public.hiring_access_tokens as access_token
join public.hiring_applications as application
  on application.id = access_token.application_id
where access_token.token_hash = p_token_hash::char(64)
  and access_token.scope = 'verification'
  and access_token.expires_at > p_now
  and access_token.revoked_at is null
  and application.lifecycle_state = 'assessment_submitted'
for update of application;
```

Insert exactly one report, set attempt `1` and `NOTIFICATION_IN_PROGRESS` only for the process that wins the insert, and return `application`, `payment_report`, and `notification_claimed`. For an existing row, return it without changing `payer_name`; claim a retry only after a prior failure or a five-minute stale in-progress lease. Mark-sent/mark-failed RPCs compare the expected attempt number so an older worker cannot overwrite a newer claim.

Enable RLS, revoke all table/sequence access from `anon` and `authenticated`, grant table access and RPC execution only to `service_role`, and revoke function execution from `public`, `anon`, and `authenticated`.

- [ ] **Step 4: Implement Supabase adapter mappings**

Add internal mapping shaped as:

```js
{
  id,
  applicationId,
  payerName,
  amountMinor,
  currency,
  reportedAt: Date,
  notificationSentAt: Date | null,
  notificationAttemptCount,
  lastNotificationError
}
```

Map claim RPC results to `{ application, paymentReport, notificationClaimed }`. Ensure the existing verification repository maps `payment_report` for status, while public redaction remains the service's responsibility.

- [ ] **Step 5: Run persistence tests and verify GREEN**

Run: `npm test -- tests/api/wisePaymentReportMigration.test.js tests/api/supabaseVerificationRepository.test.js`

Expected: all migration and adapter tests PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add supabase/migrations/20260711103927_wise_payment_reports.sql api/_lib/adapters/supabase.js tests/api/wisePaymentReportMigration.test.js tests/api/supabaseVerificationRepository.test.js
git commit -m "feat: persist Wise payment reports"
```

---

### Task 3: Recruiter Email, API Handler, And Runtime Composition

**Files:**
- Create: `tests/api/wisePaymentReportHandlers.test.js`
- Create: `tests/api/wisePaymentReportRuntime.test.js`
- Create: `api/_lib/wisePaymentReportRuntime.js`
- Create: `api/verifications/[token]/payment-report.js`
- Modify: `api/_lib/verificationHttp.js`
- Modify: `api/_lib/adapters/hiringEmail.js`
- Modify: `api/_lib/adapters/testProviders.js`
- Modify: `api/_lib/testHiringRuntime.js`
- Modify: `tests/api/hiringEmail.test.js`
- Modify: `tests/api/testRuntimeSelection.test.js`

**Interfaces:**
- Consumes: Task 1 service, Task 2 repository, `readAssessmentEnv`, `getSupabaseAdmin`, `createLiveEmailClient`, `createHiringEmailAdapter`, `setPrivateHeaders`, and `sendHttpError`.
- Produces: POST `/api/verifications/:token/payment-report`; `createWisePaymentReportHandler(service)`; `createWisePaymentReportRuntime({ client, emailClient, env })`; recruiter email `enqueueWisePaymentReport`.

- [ ] **Step 1: Write failing email, handler, and runtime tests**

Assert the recruiter email has subject `Wise payment reported - AUR-1`, recipient `auralis.careers@proton.me`, fixed `EUR 2.99`, candidate name/email, role, payer name, ISO UTC timestamp, manual Wise check/refund wording, and the not-proof/hiring-independent statement. Assert `<script>` in the payer name is escaped and no token/CV/payment credential appears. Assert idempotency key `wise-payment-report/application-1`.

Handler tests must prove:

```js
expect(service.reportPayment).toHaveBeenCalledWith({
  verificationToken: "private-verification-token",
  payerName: "Nino Beridze"
});
expect(result.headers["cache-control"]).toBe("no-store");
expect(result.headers["x-robots-tag"]).toBe("noindex, nofollow");
```

Also reject non-POST methods, unknown body keys (`amount`, `currency`, `applicationId`, `status`, `email`), and non-string names with 422. Accept `{}` so the domain service can authorize a pending retry. Assert domain errors retain their status code. Runtime tests must prove live dependencies compose and test mode exposes `reportPayment` without live credentials.

- [ ] **Step 2: Run integration-boundary tests and verify RED**

Run: `npm test -- tests/api/hiringEmail.test.js tests/api/wisePaymentReportHandlers.test.js tests/api/wisePaymentReportRuntime.test.js tests/api/testRuntimeSelection.test.js`

Expected: FAIL because the email method, route, runtime, and test provider are missing.

- [ ] **Step 3: Add the recruiter email**

Add `enqueueWisePaymentReport({ application, paymentReport })` to `createHiringEmailAdapter`. Use the adapter's existing `escapeHtml` and `send` helpers. The email must use only server-resolved values and this stable key:

```js
`wise-payment-report/${application.id}`
```

- [ ] **Step 4: Add strict HTTP parsing and the POST handler**

Export this schema from `verificationHttp.js`:

```js
export const wisePaymentReportBodySchema = z.object({
  payerName: z.string().optional()
}).strict();
```

The handler calls `setPrivateHeaders`, requires `POST`, reads the token from the route, parses the strict body, delegates to `service.reportPayment`, and returns 200 JSON. It never logs token or payer name.

- [ ] **Step 5: Compose live and deterministic runtimes**

Compose the live service from the Supabase Wise report repository and hiring email adapter using assessment-level environment variables. Extend deterministic state with `wisePaymentReports`, add repository transitions matching the production claim contract, add `wise_payment_report` email events, and expose the service as `runtime.wisePaymentReport`.

- [ ] **Step 6: Run integration-boundary tests and verify GREEN**

Run: `npm test -- tests/api/hiringEmail.test.js tests/api/wisePaymentReportHandlers.test.js tests/api/wisePaymentReportRuntime.test.js tests/api/testRuntimeSelection.test.js`

Expected: all selected tests PASS.

- [ ] **Step 7: Commit email and API integration**

```bash
git add api/_lib/verificationHttp.js api/_lib/adapters/hiringEmail.js api/_lib/adapters/testProviders.js api/_lib/testHiringRuntime.js api/_lib/wisePaymentReportRuntime.js api/verifications/'[token]'/payment-report.js tests/api/hiringEmail.test.js tests/api/wisePaymentReportHandlers.test.js tests/api/wisePaymentReportRuntime.test.js tests/api/testRuntimeSelection.test.js
git commit -m "feat: notify recruiter of Wise payment reports"
```

---

### Task 4: Redacted Durable Verification Status

**Files:**
- Modify: `api/_lib/verificationService.js`
- Modify: `tests/api/verificationService.test.js`
- Modify: `tests/api/verificationHandlers.test.js`

**Interfaces:**
- Consumes: Task 2 repository record `paymentReport`.
- Produces: public status `paymentReport: { state: "not_reported" | "notification_pending" | "reported", reportedAt: string | null }`.

- [ ] **Step 1: Write failing public-status tests**

Add separate tests for no row, pending row, and notified row:

```js
expect(status.paymentReport).toEqual({
  state: "notification_pending",
  reportedAt: "2026-07-11T10:00:00.000Z"
});
expect(JSON.stringify(status)).not.toMatch(/payerName|payer_name|Nino Beridze/);
```

The no-row state has `reportedAt: null`; a row with `notificationSentAt` is `reported`. Preserve existing manual Wise payment metadata.

- [ ] **Step 2: Run status tests and verify RED**

Run: `npm test -- tests/api/verificationService.test.js tests/api/verificationHandlers.test.js`

Expected: FAIL because `paymentReport` is absent.

- [ ] **Step 3: Add the redacted status projection**

Map only notification state and ISO `reportedAt`. Do not add payer name, report ID, application ID, attempt count, or notification error to the browser response.

- [ ] **Step 4: Run status tests and verify GREEN**

Run: `npm test -- tests/api/verificationService.test.js tests/api/verificationHandlers.test.js`

Expected: all selected status tests PASS.

- [ ] **Step 5: Commit status projection**

```bash
git add api/_lib/verificationService.js tests/api/verificationService.test.js tests/api/verificationHandlers.test.js
git commit -m "feat: expose redacted Wise report status"
```

---

### Task 5: Applicant Report Form And Recovery States

**Files:**
- Modify: `src/hiring/api/hiringClient.js`
- Modify: `src/hiring/pages/VerificationPage.jsx`
- Modify: `src/hiring/styles.css`
- Modify: `tests/hiring/hiringClient.test.js`
- Modify: `tests/hiring/VerificationPage.test.jsx`

**Interfaces:**
- Consumes: status `paymentReport`; POST response `{ state, reportedAt }`.
- Produces: `hiringClient.reportWisePayment(token, payerName?)`; inline first-report form; pending retry state; final reported state.

- [ ] **Step 1: Write failing client and page tests**

Client test:

```js
await client.reportWisePayment("verification/token", "Nino Beridze");
expect(fetchImpl).toHaveBeenCalledWith(
  "/api/verifications/verification%2Ftoken/payment-report",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ payerName: "Nino Beridze" })
  })
);
```

Also assert retry sends `{}`. Page tests must prove the secondary action reveals exactly one payer-name field; client validation blocks blank/oversized input; Unicode submits; amount/reference are read-only context; submitting calls the API; `reported` replaces the Wise link and form with the approved completion copy; `notification_pending` hides the Wise link, shows `Payment report saved. Recruiter notification is pending.`, and a retry calls the endpoint with no name; a reported status loaded on refresh immediately renders the final state; no visible text calls the report successful/verified/confirmed/matched/refunded; no card/receipt/bank fields exist.

- [ ] **Step 2: Run client/page tests and verify RED**

Run: `npm test -- tests/hiring/hiringClient.test.js tests/hiring/VerificationPage.test.jsx`

Expected: FAIL because the client mutation and report controls do not exist.

- [ ] **Step 3: Add the hiring client mutation**

Implement:

```js
async reportWisePayment(token, payerName) {
  const response = await fetchImpl(
    `/api/verifications/${encodeURIComponent(token)}/payment-report`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payerName === undefined ? {} : { payerName })
    }
  );
  return parseJsonResponse(response);
}
```

Extend the demo client with local `not_reported -> reported` behavior and the same response shape.

- [ ] **Step 4: Implement page states and exact copy**

Keep report state in `VerificationPage` and initialize it from the GET response. In `not_reported`, retain the Wise link and add `I've completed the Wise payment`. The expanded form contains `Name used for the Wise payment`, fixed `EUR 2.99`, application reference, `Report payment`, and the warning that a report is not proof Wise completed the transaction.

In `notification_pending`, remove both payment actions and show the pending message plus `Retry recruiter notification`. In `reported`, show:

```text
Payment reported
Your application is complete. Auralis will manually match the EUR 2.99 payment and initiate the refund. No further action is required.
```

Continue showing the application reference and refund-timing statement. Link corrections to `mailto:auralis.careers@proton.me` only after the report is stored.

- [ ] **Step 5: Add responsive styling**

Use existing square borders, `--signal`, `--hiring-line-strong`, `--font-ui`, and verification breakpoints. Give fields/buttons stable minimum heights, use `minmax(0, 1fr)`, `min-width: 0`, and `overflow-wrap: anywhere` for references/names. On widths `<=720px`, stack read-only context and controls; on `<=390px`, keep every action at `width: 100%`. Do not introduce nested cards, gradients, pill buttons, or viewport-scaled fonts.

- [ ] **Step 6: Run client/page tests and verify GREEN**

Run: `npm test -- tests/hiring/hiringClient.test.js tests/hiring/VerificationPage.test.jsx`

Expected: all selected frontend tests PASS with no React warnings.

- [ ] **Step 7: Commit the applicant experience**

```bash
git add src/hiring/api/hiringClient.js src/hiring/pages/VerificationPage.jsx src/hiring/styles.css tests/hiring/hiringClient.test.js tests/hiring/VerificationPage.test.jsx
git commit -m "feat: add Wise payment report experience"
```

---

### Task 6: End-To-End Coverage, Privacy, Operations, Migration, And Deployment

**Files:**
- Create: `tests/e2e/wisePaymentReport.test.jsx`
- Modify: `src/hiring/pages/PrivacyPage.jsx`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-11-wise-payment-report-design.md`

**Interfaces:**
- Consumes: complete report runtime and UI from Tasks 1–5.
- Produces: tested assessment-to-report journey, updated disclosure/runbook, applied production migration, and verified Vercel deployment.

- [ ] **Step 1: Write the failing deterministic end-to-end test**

Advance a deterministic application through assessment submission without creating a hosted TBC session. Render `/verify/:token` with status/report client methods backed by `runtime.verification` and `runtime.wisePaymentReport`. Open the Wise link, reveal the report form, submit `Nino Beridze`, and assert one stored report, one `wise_payment_report` email, unchanged application lifecycle `assessment_submitted`, and final `Payment reported` UI. Submit the same report again through the service and assert the row/email counts remain one.

- [ ] **Step 2: Run the end-to-end test and verify RED or GREEN for the complete story**

Run: `npm test -- tests/e2e/wisePaymentReport.test.jsx`

Expected before the final fixture wiring: FAIL at the missing runtime client bridge. Add only that bridge, then rerun until PASS.

- [ ] **Step 3: Update privacy, specification, and operator documentation**

Privacy copy must identify payer name and report timestamp as operational reconciliation data, say the report is not Wise confirmation, and retain manual-refund/non-hiring wording. Update README's Wise section to require a reusable link, describe the internal report email and manual Wise Activity match, and state that clicking `I've completed the Wise payment` is not proof. Mark the design spec `Approved` and document that `{}` is accepted only when retrying an already-persisted pending notification.

- [ ] **Step 4: Run the full local verification suite**

Run:

```bash
npm test
npm run test:e2e
npm run build
git diff --check
```

Expected: all unit/integration tests PASS, all end-to-end tests PASS, Vite build exits 0, and `git diff --check` prints nothing.

- [ ] **Step 5: Apply and verify the linked Supabase migration**

Discover current commands before use:

```bash
supabase db --help
supabase migration --help
```

Apply the pending linked migration with the CLI's documented push command. Then verify `supabase migration list` shows `20260711103927` locally and remotely. Run a read-only SQL verification through the available linked-database command or Supabase MCP to confirm the table has RLS enabled, no `anon`/`authenticated` table privileges, all four mutation RPCs are executable only by `service_role`, and `get_hiring_verification_by_token` returns a `payment_report` key for a controlled test record. Do not create a payment report against a real applicant token.

- [ ] **Step 6: Browser-test local desktop and mobile states**

Start Vite on an unused localhost port. Use the in-app browser with a controlled demo/test client to inspect `not_reported`, `notification_pending`, and `reported` at `1440x1000`, `1024x768`, `390x844`, and `360x800`. For every viewport, assert `document.documentElement.scrollWidth <= window.innerWidth`, no intersecting text/action rectangles, input labels remain visible, and no console errors occur. Capture screenshots for the final three states.

- [ ] **Step 7: Commit documentation and end-to-end coverage**

```bash
git add tests/e2e/wisePaymentReport.test.jsx src/hiring/pages/PrivacyPage.jsx README.md docs/superpowers/specs/2026-07-11-wise-payment-report-design.md
git commit -m "test: verify Wise payment report journey"
```

- [ ] **Step 8: Push, deploy, and verify production**

Push `main`, deploy production through the existing Vercel project, and confirm `https://auralis-nine.vercel.app` resolves to the new Ready deployment. Verify the production status endpoint for a controlled private test token returns `paymentReport` with no payer name and private headers. Open the production verification page at desktop/mobile widths and verify rendering, console, and overflow without submitting a report for a real applicant. Confirm the payment link still resolves exactly to `https://wise.com/pay/r/nAx15LFiReIdtjc`.

- [ ] **Step 9: Final repository and deployment audit**

Run:

```bash
git status --short --branch
git log -6 --oneline
git rev-parse HEAD
git rev-parse origin/main
```

Expected: clean `main`, local HEAD equals `origin/main`, and the Ready production deployment contains that commit.

