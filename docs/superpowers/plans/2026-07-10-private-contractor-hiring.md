# Auralis Private Contractor Hiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved private worldwide-contractor application, MCQ assessment, hosted TBC preauthorization, and email-only recruiter workflow inside the existing Auralis React/Vite site.

**Architecture:** Deliver the system in three independently testable phases. The existing Vite frontend gains route-level hiring surfaces, while Vercel Functions own all trusted state transitions. Supabase stores application state and private CVs, Resend sends transactional mail, Cloudflare Turnstile limits automated submissions, and TBC E-Commerce hosts the card UI and performs preauthorization/cancellation.

**Tech Stack:** React 19, Vite 7, React Router, Vercel Functions, Supabase Postgres/Storage, Resend, Cloudflare Turnstile, TBC E-Commerce, Zod, Vitest, Testing Library, Playwright-compatible Browser/IAB verification.

## Global Constraints

- Binding specification: `docs/superpowers/specs/2026-07-10-private-contractor-hiring-design.md`.
- Binding visual assets: `docs/superpowers/specs/assets/auralis-hiring-*.png`.
- Roles are senior, remote, worldwide independent-contractor roles; never describe them as employment.
- Every submitted CV triggers a human-review email to `hello@auralis.studio` before assessment or payment completion.
- Assessments contain 18 MCQs, allow no typing, run for 20 server-authoritative minutes, and never auto-reject.
- The EUR 2.99 verification never changes score, review order, eligibility, or hiring outcome.
- Auralis renders no card fields; TBC E-Commerce owns the hosted payment portal.
- Payment uses `preAuth: true`, `saveCard: false`, authoritative status lookup, and immediate cancellation request.
- CVs are PDF only, private, at most 5 MB, and retained with identifiable application data for 180 days.
- No public careers directory, recruiter dashboard, candidate account, AI scoring, or interview scheduling.
- Preserve the approved true-black, porcelain, molten-red, signal-lime, ruled editorial visual system.
- Display line height may not fall below `0.96`; letter spacing remains `0`.
- No secrets or live credentials enter the repository.
- The workspace is not currently a Git repository. Do not execute commit commands unless the user initializes Git; each phase plan includes the intended commit message for later use.

## Execution Order

1. [Phase 1: Application foundation](2026-07-10-hiring-application-foundation.md)
2. [Phase 2: MCQ assessment](2026-07-10-hiring-assessment.md)
3. [Phase 3: Hosted verification and launch hardening](2026-07-10-hiring-verification-launch.md)

Each phase ends in a usable checkpoint:

- Phase 1 accepts a private campaign application, stores a private CV, and sends the candidate/recruiter emails using test adapters.
- Phase 2 adds the complete timed MCQ flow and sends assessment results independently of payment.
- Phase 3 adds TBC hosted checkout, verified cancellation, completion, privacy retention, responsive fidelity, and production configuration checks.

## Final Verification Command Set

Run after every phase and again after Phase 3:

```bash
npm run test
npm run build
```

After Phase 3, also run:

```bash
npm run test:e2e
```

Expected result: all tests pass, Vite production build exits `0`, Browser/IAB console has no errors or warnings, and desktop/mobile screenshots match the approved concepts without overflow or text overlap.

