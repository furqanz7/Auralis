# Auralis

Auralis is a cinematic Vite and React studio website with an unlisted independent-contractor application route. There is no public careers directory, candidate account, or public assessment route.

## Local Development

```bash
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```

Use `.env.example` as the environment inventory. `HIRING_PROVIDER_MODE=test` selects deterministic in-memory providers locally and does not require live Supabase or Resend credentials. Vercel production rejects test mode; production must set `HIRING_PROVIDER_MODE=live`.

## Direct Applications

Use this unlisted applicant URL in the Instagram hiring post:

```text
https://auralis-nine.vercel.app/apply
```

The page is intentionally reachable from that direct link, but it is not included in site navigation, a sitemap, or a public careers directory. Applicants select one active role in the form, upload a PDF CV, and submit their details. The server maps the chosen role to a server-owned intake source; campaign IDs and tokens are never exposed to the applicant.

Every submission sends an internal notification to `auralis.careers@proton.me` with the candidate details, a one-time CV link, and a private assessment URL. Forward the assessment URL manually after reviewing the CV. The applicant never receives an automatic assessment email.

## Supabase Migrations

Apply Supabase migrations in filename order:

1. `202607100001_hiring_application.sql`
2. `202607100002_hiring_assessment.sql`
3. `202607100003_hiring_assessment_reminders.sql`
4. `202607100004_hiring_verification.sql`
5. `202607100005_hiring_privacy.sql`
6. `20260710085247_harden_hiring_runtime.sql`

Run them against a dedicated project before issuing a campaign. Confirm that the `hiring-cvs` bucket is private, RLS is enabled, no `anon` or `authenticated` grants exist on hiring tables or RPCs, and service-role RPC grants are present. The runtime deletes the CV object before deleting PII rows and retries storage failures.

## Provider Setup

### Resend Internal Delivery

The sender is `Auralis Hiring <onboarding@resend.dev>`. Every application notification is delivered to `auralis.careers@proton.me` with the candidate details, a private CV link, and a private assessment URL valid for 14 days after application. The Proton address must be the email address on the Resend account because Resend's test sender can only deliver to its account owner. Auralis sends the assessment URL manually after review; the system does not automatically email candidates, including reminders, verification updates, or deletion-confirmation links.

After entering a newly rotated Resend API key in the ignored `.env.local` file, verify delivery to the Proton inbox with:

```bash
npm run resend:verify
```

### Wise Manual Payment

`WISE_PAYMENT_URL` is the reusable Wise Business payment link shown only after a valid private verification token is loaded. The applicant must select EUR, enter 2.99, and place the application reference in Wise's Description field.

This flow does not provide application-specific automatic confirmation or an immediate authorization release. Auralis reconciles the payment manually using the description and initiates a manual refund from Wise. Refund arrival depends on Wise and the original payment method and must not be described as instant. Payment verification never changes assessment results, eligibility, review order, or contractor selection.

### Vercel Cron

Set a random `CRON_SECRET` of at least 32 characters. Vercel sends it as `Authorization: Bearer <secret>`. The project schedules hiring retention daily at 02:30 UTC. Automated payment-cancellation retries are disabled because the active Wise flow is manual.

Use a Vercel plan that supports the configured cron frequency. Confirm successful invocations and alerts after deployment.

## Privacy Operations

Application and CV deletion is due 180 days after the most recent hiring activity. Candidates can request earlier deletion from `/privacy` by emailing `auralis.careers@proton.me` from the address used for the application. The private confirmation-link implementation remains available for previously issued links, but no new candidate email is sent while the project uses Resend's test sender.

The privacy controller is identified as Auralis, Tbilisi, Georgia. Have qualified Georgian privacy counsel verify these supplied identity details and review the final privacy notice, independent-contractor terms, international-transfer wording, assessment process, and refundable verification disclosure before launch.

## Production Checklist

- Set every live environment variable in `.env.example`; generate independent high-entropy secrets.
- Confirm `HIRING_PROVIDER_MODE=live` and Vercel's `VERCEL_ENV=production`.
- Apply and inspect all Supabase migrations and private storage settings.
- Complete Resend internal-delivery verification to `auralis.careers@proton.me`.
- Confirm the hidden application bot-trap rejects populated automated submissions without affecting legitimate applicants.
- Confirm the Wise link opens, requires the applicant to select EUR and enter 2.99, and displays the application reference to use as the payment description.
- Confirm the manual refund wording remains visible and never promises instant processing.
- Verify Vercel Cron authentication, retention runs, and operational alerts.
- Verify the published controller identity, Auralis, Tbilisi, Georgia, and obtain legal review.
- Run `npm test`, `npm run test:e2e`, and `npm run build`.
- Verify the unlisted `/apply` route, assessment, verification, completion, and privacy routes at desktop and mobile widths with no text overlap or horizontal overflow.
- Confirm every application notification reaches `auralis.careers@proton.me` with a working CV link and assessment URL.
- Confirm verification never changes score, eligibility, review order, or contractor selection.

## Deploy to Vercel

Deploy this directory as the Vercel project root. Vite builds the public pages from the HTML entry points and `src/`; Vercel serves API functions from `api/` and applies private rewrites, no-store headers, noindex headers, and cron schedules from `vercel.json`.
