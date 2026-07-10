# Auralis Hiring Phase 2: MCQ Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six role-specific, timed, single-use MCQ assessments with autosave, server-authoritative scoring, candidate invitations, reminders, and recruiter result emails.

**Architecture:** Versioned assessment definitions remain in reviewed source files, while Supabase stores an immutable ordered snapshot for each attempt. Vercel Functions own token validation, timing, answer persistence, submission, and scoring. The React assessment route renders one semantic radio group at a time and never receives correctness data.

**Tech Stack:** Existing Phase 1 stack plus versioned JavaScript question banks, server-side seeded shuffling, Vercel Cron for reminders, Vitest fake clocks, and Testing Library.

## Global Constraints

Phase 1 must be green before this plan begins. Apply every constraint from `docs/superpowers/plans/2026-07-10-private-contractor-hiring.md`. Use test-driven development for every state transition.

## File Map

- `shared/hiring/assessmentSchema.js`: versioned question and result contracts.
- `shared/hiring/questions/*.js`: exactly 18 reviewed questions per role.
- `api/_lib/assessmentService.js`: invitation, start, save, submit, expiry, and scoring logic.
- `api/assessments/[token]/index.js`: token-scoped assessment read.
- `api/assessments/[token]/start.js`: assessment start mutation.
- `api/assessments/[token]/answers/[questionId].js`: answer save mutation.
- `api/assessments/[token]/submit.js`: assessment submission.
- `api/cron/assessment-reminders.js`: one reminder after 24 hours.
- `src/hiring/pages/AssessmentPage.jsx`: approved assessment composition.
- `src/hiring/components/AssessmentQuestion.jsx`: semantic MCQ row set.
- `src/hiring/hooks/useAssessmentSession.js`: timer, autosave, navigation, and recovery.
- `supabase/migrations/202607100002_hiring_assessment.sql`: assessment tables.

---

### Task 1: Define and validate all six assessment banks

**Files:**
- Create: `shared/hiring/assessmentSchema.js`
- Create: `shared/hiring/questions/aiProductEngineer.js`
- Create: `shared/hiring/questions/creativeFrontendDeveloper.js`
- Create: `shared/hiring/questions/fullStackProductEngineer.js`
- Create: `shared/hiring/questions/productDesigner.js`
- Create: `shared/hiring/questions/brandSystemsDesigner.js`
- Create: `shared/hiring/questions/productStrategyLead.js`
- Create: `shared/hiring/questions/index.js`
- Create: `tests/shared/assessmentBanks.test.js`

**Interfaces:**
- `ASSESSMENT_VERSION = 1`.
- `getAssessmentDefinition(roleSlug)` returns `{ version, durationSeconds, questions }`.
- Each question is `{ id, dimension, prompt, options, correctOptionId }`.
- Browser-safe projections remove `correctOptionId`.

- [ ] **Step 1: Write the failing bank-validation test**

```js
import { describe, expect, test } from "vitest";
import { ROLE_CONFIG } from "../../shared/hiring/roles.js";
import { getAssessmentDefinition } from "../../shared/hiring/questions/index.js";

describe.each(ROLE_CONFIG)("$title assessment", ({ slug }) => {
  test("contains 18 valid questions across the approved dimensions", () => {
    const assessment = getAssessmentDefinition(slug);
    expect(assessment.durationSeconds).toBe(1200);
    expect(assessment.questions).toHaveLength(18);
    expect(new Set(assessment.questions.map((question) => question.id)).size).toBe(18);
    expect(assessment.questions.reduce((counts, question) => {
      counts[question.dimension] = (counts[question.dimension] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ craft: 6, systems: 4, judgment: 4, delivery: 4 });
    for (const question of assessment.questions) {
      expect(question.options).toHaveLength(4);
      expect(question.options.some((option) => option.id === question.correctOptionId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/shared/assessmentBanks.test.js`

Expected: FAIL because assessment definitions do not exist.

- [ ] **Step 3: Implement the schema and question shape**

```js
export const DIMENSIONS = ["craft", "systems", "judgment", "delivery"];

export function defineQuestion(question) {
  if (!DIMENSIONS.includes(question.dimension)) throw new Error(`Invalid dimension: ${question.id}`);
  if (question.options.length !== 4) throw new Error(`Expected four options: ${question.id}`);
  return Object.freeze(question);
}
```

Question prompts and distractors must be scenario-based, contain one defensible best answer, avoid trivia, avoid protected-personal data, and avoid `all of the above` or `none of the above` so option order can be randomized.

- [ ] **Step 4: Author the exact 18-topic bank for each role**

Use this reviewed topic order; map positions 1-6 to `craft`, 7-10 to `systems`, 11-14 to `judgment`, and 15-18 to `delivery`.

```text
Senior AI Product Engineer:
model evaluation, retrieval quality, prompt-injection boundaries, tool permissions,
structured outputs, human review, async orchestration, explicit fallbacks,
traceability, latency/cost control, model-version rollout, privacy tradeoff,
agent autonomy boundary, production-readiness decision, queue backpressure,
incident response, stakeholder explanation, delivery sequencing

Senior Creative Frontend Developer:
semantic HTML, advanced CSS layout, responsive art direction, typography metrics,
image performance, motion choreography, hydration/state boundaries, code splitting,
WebGL fallback, browser observability, keyboard accessibility, reduced motion,
design-fidelity tradeoff, form error design, design-system contribution,
cross-browser QA, estimation, launch regression handling

Senior Full-Stack Product Engineer:
API idempotency, transaction boundaries, authorization, database indexing,
schema migration, webhook verification, queue/retry design, cache invalidation,
eventual consistency, observability, secret handling, rate limiting,
build-versus-buy, failure-mode prioritization, test strategy, incident response,
API-version communication, scope sequencing

Senior Product Designer:
problem framing, information architecture, task-flow design, accessible interaction,
form design, prototype fidelity, usability-test design, responsive hierarchy,
design-system reuse, edge-case coverage, evidence versus stakeholder preference,
metric selection, prioritization, critique response, engineering handoff,
research synthesis, launch validation, scope negotiation

Senior Brand and Visual Systems Designer:
brand strategy, typography system, color system, logo scalability,
art direction, grid/composition, digital asset system, motion identity,
responsive brand behavior, accessibility, consistency-versus-flexibility,
localization, brand evolution, critique decision, guideline handoff,
asset delivery, cross-channel QA, stakeholder alignment

Senior Product Strategy and Delivery Lead:
opportunity framing, discovery planning, roadmap structure, prioritization,
outcome metrics, workshop design, dependency mapping, delivery risk,
resource planning, quality gates, stakeholder conflict, scope change,
contract boundary, escalation judgment, client communication,
team operating cadence, launch readiness, post-launch review
```

Each file must export 18 complete `defineQuestion(...)` objects with four explicit options and one correct option. Never generate questions at runtime.

- [ ] **Step 5: Run the bank tests and manually review content**

Run: `npm run test -- tests/shared/assessmentBanks.test.js`

Expected: all six parameterized suites PASS. Manually inspect every correct answer and distractor before continuing.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: add reviewed contractor assessment banks`

---

### Task 2: Add assessment persistence and domain services

**Files:**
- Create: `supabase/migrations/202607100002_hiring_assessment.sql`
- Create: `api/_lib/assessmentService.js`
- Extend: `api/_lib/adapters/contracts.js`
- Extend: `api/_lib/adapters/supabase.js`
- Modify: `api/_lib/applicationService.js`
- Create: `tests/api/assessmentService.test.js`
- Create: `tests/api/assessmentMigration.test.js`

**Interfaces:**
- `createAssessmentService({ repository, email, clock, random })`.
- `issueInvitation(application)` returns `{ token, expiresAt }` and stores only the hash.
- `startAssessment(token)` returns browser-safe ordered questions and `deadlineAt`.
- `saveAnswer(token, questionId, optionId, version)` returns `{ savedAt, version }`.
- `submitAssessment(token)` returns `{ applicationReference, verificationToken }` without score.

- [ ] **Step 1: Write failing assessment lifecycle tests**

Cover:

1. Invitation expires exactly 72 hours after issuance.
2. Starting snapshots all 18 questions in deterministic shuffled order.
3. Client payload never includes `correctOptionId`.
4. Start is idempotent and never resets the timer.
5. Answer save rejects unknown question/option and stale version.
6. Submission locks responses and computes total plus four dimensions.
7. Resubmission returns the existing result without duplicate emails.
8. Server expiry submits saved answers and locks the attempt.
9. There is no pass/fail or automatic rejection state.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/assessmentService.test.js`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Write the migration**

Create `hiring_assessment_sessions` and `hiring_assessment_responses`. Persist assessment version, ordered question/option snapshots, token hash, invitation/start/deadline/submission timestamps, raw score, dimension JSON, response version, and lock state. Enable RLS with no public policy and add unique constraints for one active assessment per application and one response per question.

- [ ] **Step 4: Implement seeded ordering and server-safe projection**

Derive the shuffle seed from an HMAC of application ID plus assessment version. The same session always gets the same order. Return only `id`, `dimension`, `prompt`, and ordered `{ id, label }` options to the browser.

- [ ] **Step 5: Extend application submission**

Within the same application use case, create the assessment invitation before enqueueing candidate email. The email receives the raw token once; the database receives only its SHA-256 hash.

- [ ] **Step 6: Run lifecycle and migration tests**

Run: `npm run test -- tests/api/assessmentService.test.js tests/api/assessmentMigration.test.js tests/api/applicationService.test.js`

Expected: PASS; Phase 1 application tests remain green.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `feat: add timed assessment lifecycle`

---

### Task 3: Expose token-scoped assessment endpoints

**Files:**
- Create: `api/assessments/[token]/index.js`
- Create: `api/assessments/[token]/start.js`
- Create: `api/assessments/[token]/answers/[questionId].js`
- Create: `api/assessments/[token]/submit.js`
- Create: `tests/api/assessmentHandler.test.js`
- Modify: `vercel.json`

**Interfaces:**
- `GET /api/assessments/:token`
- `POST /api/assessments/:token/start`
- `PUT /api/assessments/:token/answers/:questionId`
- `POST /api/assessments/:token/submit`
- Stable error codes: `ASSESSMENT_INVALID`, `ASSESSMENT_EXPIRED`, `ASSESSMENT_LOCKED`, `ANSWER_CONFLICT`, `ANSWER_INVALID`.

- [ ] **Step 1: Write failing handler tests**

Test method/action routing, token omission, no-store headers, browser-safe question payload, optimistic response versioning, expiry response, and idempotent submit.

- [ ] **Step 2: Run handler tests and verify RED**

Run: `npm run test -- tests/api/assessmentHandler.test.js`

Expected: FAIL because the handler does not exist.

- [ ] **Step 3: Implement a thin handler**

Route actions to `assessmentService`; validate bodies with Zod; never accept timer, score, correctness, application ID, or role ID from the browser.

- [ ] **Step 4: Add route headers**

Update `vercel.json` so `/assessment/*` and its API responses receive `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, and the existing content-type protection.

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/api/assessmentHandler.test.js`

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: expose private assessment endpoints`

---

### Task 4: Build the approved assessment screen

**Files:**
- Create: `src/hiring/pages/AssessmentPage.jsx`
- Create: `src/hiring/components/AssessmentQuestion.jsx`
- Create: `src/hiring/hooks/useAssessmentSession.js`
- Modify: `src/routes/AppRoutes.jsx`
- Extend: `src/hiring/api/hiringClient.js`
- Extend: `src/hiring/styles.css`
- Create: `tests/hiring/AssessmentPage.test.jsx`
- Create: `tests/hiring/useAssessmentSession.test.jsx`

**Interfaces:**
- Route: `/assessment/:token`.
- Hook state: `{ status, questions, activeIndex, responses, deadlineAt, saveState, error }`.
- Actions: `selectAnswer(questionId, optionId)`, `goBack()`, `goNext()`, `submit()`.

- [ ] **Step 1: Write failing hook/component tests**

Test one semantic radio group, option selection autosave, save conflict recovery, back/next navigation, disabled next until an answer is acknowledged, timer thresholds, server expiry, single submit, keyboard operation, and absence of correctness/score output.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/hiring/AssessmentPage.test.jsx tests/hiring/useAssessmentSession.test.jsx`

Expected: FAIL because assessment UI modules do not exist.

- [ ] **Step 3: Implement the hook**

Use the server-provided `deadlineAt`; derive display time from `Date.now()` but treat API expiry as authoritative. Keep one in-flight save per question and coalesce rapid selection changes. Persist only token-safe UI state in session storage; never persist correct answers or scores.

- [ ] **Step 4: Implement the approved screen**

Match `auralis-hiring-assessment.png`:

- left role/progress/rules rail;
- right high-contrast serif question;
- four full-width ruled answers;
- molten-red selected marker plus signal-lime confirmation;
- quiet back action and underlined next action;
- timer visible but not alarmist;
- all 18 questions usable at 390px without horizontal scrolling.

- [ ] **Step 5: Run UI tests and build**

Run:

```bash
npm run test -- tests/hiring/AssessmentPage.test.jsx tests/hiring/useAssessmentSession.test.jsx
npm run build
```

Expected: PASS and build exit `0`.

- [ ] **Step 6: Record checkpoint**

Intended commit when Git exists: `feat: build private MCQ assessment experience`

---

### Task 5: Add reminders and recruiter assessment emails

**Files:**
- Create: `api/cron/assessment-reminders.js`
- Extend: `api/_lib/adapters/resendEmail.js`
- Extend: `api/_lib/assessmentService.js`
- Create: `tests/api/assessmentEmails.test.js`
- Modify: `vercel.json`

**Interfaces:**
- `enqueueAssessmentReminder(session)` once after 24 hours.
- `enqueueRecruiterAssessment(application, result)` immediately after submit/expiry.
- Cron endpoint authenticated by `CRON_SECRET`.

- [ ] **Step 1: Write failing email tests**

Verify one reminder only, no reminder after start/expiry, recruiter result email before payment, no score in candidate email, idempotent provider message keys, and retry state persistence.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- tests/api/assessmentEmails.test.js`

Expected: FAIL because reminder/result dispatch is absent.

- [ ] **Step 3: Implement email templates and cron selection**

Recruiter result email must include role, application reference, total `x/18`, the four dimension values, duration, and a secure CV link. Candidate reminder contains only role, expiry time, and private assessment link.

- [ ] **Step 4: Add daily cron configuration**

Configure Vercel Cron to call the reminder endpoint every hour; the query selects sessions issued 24-72 hours ago with `reminder_sent_at IS NULL` and `started_at IS NULL`.

- [ ] **Step 5: Run Phase 2 verification**

Run:

```bash
npm run test
npm run build
```

Expected: all Phase 1 and Phase 2 tests PASS; build exits `0`.

- [ ] **Step 6: Verify the complete assessment in Browser/IAB**

Complete all 18 questions with keyboard only, force an autosave retry, verify expiry behavior with a fake clock, and inspect desktop/mobile screenshots against the approved assessment concept. Confirm no console errors, overlap, score disclosure, or public indexing metadata.

- [ ] **Step 7: Record checkpoint**

Intended commit when Git exists: `feat: complete assessment email workflow`
