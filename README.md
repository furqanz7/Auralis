# Auralis

Auralis is a cinematic Vite and React studio website with a private, tokenized independent-contractor application funnel. There is no public careers directory, candidate account, or public assessment route.

## Local Development

```bash
npm install
npm run dev
npm test
npm run test:e2e
npm run build
```

Use `.env.example` as the environment inventory. `HIRING_PROVIDER_MODE=test` selects deterministic in-memory providers locally and does not require live Supabase, Gmail, Turnstile, or TBC credentials. Vercel production rejects test mode; production must set `HIRING_PROVIDER_MODE=live`.

The browser uses `VITE_TURNSTILE_SITE_KEY` and `VITE_TBC_CHECKOUT_HOST`. Secrets without the `VITE_` prefix are server-only and must never be exposed to the browser.

## Private Campaigns

After the live database is migrated and environment variables are loaded, issue an expiring private application link with:

```bash
npm run hiring:campaign -- \
  --role senior-ai-product-engineer \
  --label "Instagram / July 2026" \
  --days 14
```

The command inserts only the token hash and prints the private URL once. Post that URL through the intended Instagram campaign. Do not place it in site navigation, a sitemap, or a public role index. Revoke a campaign by setting `revoked_at` in `hiring_campaigns`.

Available role slugs are defined in `shared/hiring/roles.js`.

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

### Gmail SMTP

The hiring sender is `Auralis Careers <auralis.careers@gmail.com>`. Every application notification is delivered to `auralis.careers@proton.me` with the candidate details, a private CV link, and a private assessment URL. Auralis sends the assessment URL manually after review; the system does not automatically email assessment invitations or reminders. Enable 2-Step Verification on the Gmail account, create a dedicated App Password for Auralis hiring, and store it only in `GMAIL_SMTP_APP_PASSWORD`. Never use or store the account's normal password. The server connects to `smtp.gmail.com` over TLS on port 465. Send test messages to external addresses and confirm delivery before launch.

After entering the App Password in the ignored `.env.local` file, verify the connection and send a test notification to the Proton inbox with:

```bash
npm run gmail:verify
```

### Cloudflare Turnstile

Create a Turnstile widget for `auralis.studio`. Set `VITE_TURNSTILE_SITE_KEY` in the browser environment and `TURNSTILE_SECRET_KEY` on the server. The expected action is `hiring_application`; production hostname verification must remain enabled.

### TBC Merchant

Obtain a TBC merchant account with EUR payments and preauthorization/cancellation enabled. Confirm that the TBC merchant configuration supports EUR 2.99, `preAuth: true`, and immediate full cancellation without capture.

Set the TBC API key, client ID, client secret, API base URL, and exact checkout hostname. Register this server callback with TBC:

```text
https://auralis.studio/api/payments/tbc/callback
```

The browser return is not authoritative. Only the callback plus a server-to-server provider lookup may complete verification. Auralis does not collect or store card data.

### Vercel Cron

Set a random `CRON_SECRET` of at least 32 characters. Vercel sends it as `Authorization: Bearer <secret>`. The project schedules:

- verification cancellation retries every five minutes;
- hiring retention daily at 02:30 UTC.

Use a Vercel plan that supports the configured cron frequency. Confirm successful invocations and alerts after deployment.

## Privacy Operations

Application and CV deletion is due 180 days after the most recent hiring activity. Candidates can request an email-confirmed deletion link from `/privacy`. The link only opens the confirmation screen; deletion starts after the explicit confirmation button is pressed.

The privacy controller is identified as Auralis, Tbilisi, Georgia. Have qualified Georgian privacy counsel verify these supplied identity details and review the final privacy notice, independent-contractor terms, international-transfer wording, assessment process, and refundable verification disclosure before launch.

## Production Checklist

- Set every live environment variable in `.env.example`; generate independent high-entropy secrets.
- Confirm `HIRING_PROVIDER_MODE=live` and Vercel's `VERCEL_ENV=production`.
- Apply and inspect all Supabase migrations and private storage settings.
- Complete Gmail SMTP App Password configuration and delivery tests.
- Complete Cloudflare Turnstile hostname and action tests.
- Complete TBC merchant EUR preauthorization, callback, cancellation, duplicate-callback, and delayed-callback tests.
- Verify Vercel Cron authentication, retry schedules, retention runs, and operational alerts.
- Verify the published controller identity, Auralis, Tbilisi, Georgia, and obtain legal review.
- Run `npm test`, `npm run test:e2e`, and `npm run build`.
- Verify private application, assessment, verification, completion, privacy, and deletion-confirmation routes at desktop and mobile widths with no text overlap or horizontal overflow.
- Confirm every application notification reaches `auralis.careers@proton.me` with a working CV link and assessment URL.
- Confirm verification never changes score, eligibility, review order, or contractor selection.

## Deploy to Vercel

Deploy this directory as the Vercel project root. Vite builds the public pages from the HTML entry points and `src/`; Vercel serves API functions from `api/` and applies private rewrites, no-store headers, noindex headers, and cron schedules from `vercel.json`.
