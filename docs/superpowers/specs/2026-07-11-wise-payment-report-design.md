# Auralis Wise Payment Report

Date: 2026-07-11
Status: Approved flow; awaiting written-spec review

## Objective

Add an honest post-payment step to the private contractor application flow while Auralis uses a manual Wise payment link. After returning from Wise, an applicant can report that they completed the EUR 2.99 payment. Auralis persists the report, notifies the recruiter, and shows a durable confirmation state.

A payment report is a candidate assertion, not provider confirmation. It must never be described as verified payment and must never affect assessment results, eligibility, review order, or contractor selection.

## Constraints

- The configured Wise payment link does not send a callback to Auralis.
- Auralis cannot verify the transaction automatically through Wise's public payment-link API.
- The same Wise link is presented to multiple applicants.
- Auralis does not collect card, bank-account, or receipt data.
- Recruiter notifications continue to go only to `auralis.careers@proton.me` through Resend.
- Applicants do not receive an email in this release.

Before using the flow for multiple applicants, the operator must confirm in Wise that the configured payment request is reusable. A single-use link is not suitable for this funnel.

## Applicant Journey

### Before reporting

The existing verification page continues to show:

- The fixed EUR 2.99 amount
- The Wise payment link, opened in a new tab
- The application reference
- Manual reconciliation and refund wording
- A clear statement that payment does not affect hiring

Below the Wise link, the page adds a secondary action:

`I've completed the Wise payment`

### Payment report form

Selecting the action reveals a compact inline confirmation form. It contains one required field:

- `Name used for the Wise payment`

The form also displays the application reference and EUR 2.99 amount as read-only context. It does not ask for a card number, bank details, receipt, or Wise credentials.

The payer name is trimmed and must contain between 2 and 120 characters. Unicode names are accepted. The submit command is:

`Report payment`

Supporting copy states that reporting payment does not prove that Wise completed the transaction. Auralis will manually compare the payer name, amount, and reported time with Wise activity.

The applicant reviews the payer name before submission. Once the recruiter notification has been sent, the public flow does not permit editing the report; corrections are handled through the published careers contact address.

### Successful report

After a successful report and recruiter notification, the payment panel is replaced with:

**Payment reported**

`Your application is complete. Auralis will manually match the EUR 2.99 payment and initiate the refund. No further action is required.`

The page continues to show the application reference and states that refund timing depends on Wise and the original payment method. It does not claim that the payment was verified, matched, or refunded.

Refreshing or reopening the private verification link returns the same reported state. The payment link and report action are no longer presented, preventing an accidental second payment report.

## Recruiter Notification

After the report is persisted, Auralis sends one internal email to `auralis.careers@proton.me`.

Subject:

`Wise payment reported - {application reference}`

The message includes:

- Application reference
- Candidate name and email
- Role
- Name used for the Wise payment
- EUR 2.99 amount
- UTC report timestamp
- A reminder to confirm the transaction in Wise and initiate the refund manually
- A statement that the report is not proof of payment and does not affect hiring

The email contains no verification bearer token, CV link, payment credentials, or sensitive financial information.

## Data Model

Add `hiring_wise_payment_reports` with:

- `id` UUID primary key
- `application_id` UUID, unique, foreign key with cascade deletion
- `payer_name` text
- `amount_minor` fixed to 299
- `currency` fixed to EUR
- `reported_at` timestamp
- `notification_sent_at` nullable timestamp
- `notification_attempt_count` bounded integer
- `last_notification_error` nullable operational category
- `created_at` and `updated_at` timestamps

There is exactly one report per application. The table follows the application's existing 180-day retention lifecycle and is deleted when the application is deleted.

Database access remains service-role only. New RPC functions revoke access from `public`, `anon`, and `authenticated`, then grant execution only to `service_role`.

## API

### Report payment

`POST /api/verifications/:token/payment-report`

Request:

```json
{
  "payerName": "Name shown in Wise"
}
```

The private verification token identifies the application. The server never accepts an application ID, amount, currency, candidate email, or role from the browser.

The token must resolve to an application whose assessment has been submitted and which is not deleted. Recording a payment report does not advance or otherwise alter the application's hiring lifecycle state.

Response states:

- `reported`: report stored and recruiter notification sent
- `notification_pending`: report stored but recruiter notification failed

The mutation is idempotent by application. Repeated requests never create another report. If notification is pending, a repeated request retries the same recruiter email using a stable Resend idempotency key.

### Verification status

`GET /api/verifications/:token/status` adds:

```json
{
  "paymentReport": {
    "state": "not_reported | notification_pending | reported",
    "reportedAt": "ISO timestamp or null"
  }
}
```

The response does not expose the stored payer name.

## Failure Handling

- Invalid or expired verification token: existing private-link error state.
- Invalid payer name: inline validation; nothing is stored or emailed.
- Duplicate submission: return the existing report without another row or email.
- Database failure before persistence: show a retryable submission error.
- Resend failure after persistence: return `notification_pending`; show `Payment report saved. Recruiter notification is pending.` with a retry command.
- Notification retry success: transition to `reported` and render the final confirmation.
- Wise payment absent: the recruiter treats the report as unconfirmed. No automated candidate penalty or hiring-state change occurs.

## Security And Privacy

- Private verification-token validation is required for status and report APIs.
- Responses use no-store and noindex headers through the existing verification route policy.
- Payer names are escaped in recruiter email HTML.
- Logs contain application IDs or references, never bearer tokens or payer names.
- No transaction is declared successful based on a browser click.
- No card, bank, Wise-login, receipt, or transaction credential is collected.
- Privacy copy identifies the payer name and report timestamp as operational verification data.

## Testing

Automated coverage must prove:

- Valid reports persist once and notify the recruiter once.
- Duplicate submissions are idempotent.
- Notification failure persists a pending state and can be retried.
- Invalid and expired tokens cannot report payment.
- Amount, currency, application, candidate, and role are server-owned.
- Payer-name validation accepts international names and rejects empty or oversized values.
- Status returns `not_reported`, `notification_pending`, and `reported` correctly.
- The frontend renders the report form, validation, pending-notification recovery, and final confirmation.
- The frontend never labels a self-report as provider-confirmed payment.
- Desktop and mobile layouts have no text overlap or horizontal overflow.

## Out Of Scope

- Automatic Wise transaction confirmation
- Receipt upload or OCR
- Applicant email confirmation
- Recruiter dashboard
- Automatic refund initiation
- Payment-based ranking, eligibility, or hiring decisions

## Acceptance Criteria

- An applicant can report payment with one payer-name field after opening Wise.
- The recruiter receives enough non-sensitive information to find the transaction manually.
- A report survives refresh and cannot create duplicate records or emails.
- Notification failures are visible and recoverable.
- Candidate copy distinguishes reported payment from confirmed payment.
- The existing private assessment, application, and manual-refund behavior remains intact.
