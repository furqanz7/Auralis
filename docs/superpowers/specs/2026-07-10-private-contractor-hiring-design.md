# Auralis Private Contractor Hiring System

Date: 2026-07-10
Status: Approved visual direction; awaiting written-spec review

## Objective

Build a private, role-specific hiring funnel for senior independent contractors worldwide. Candidates arrive from an Instagram campaign link, submit a short application and CV, receive a private MCQ assessment link by email, complete the assessment, perform a temporary EUR 2.99 card authorization through a hosted third-party portal, and receive confirmation.

Every CV is sent for human review. Assessment results support that review but never produce automatic acceptance or rejection. Card verification never changes assessment score, review order, eligibility, or hiring outcome.

## Approved Visual References

- Application: `docs/superpowers/specs/assets/auralis-hiring-application.png`
- Assessment: `docs/superpowers/specs/assets/auralis-hiring-assessment.png`
- Hosted payment handoff: `docs/superpowers/specs/assets/auralis-hiring-verification.png`
- Completion: `docs/superpowers/specs/assets/auralis-hiring-completion.png`

These images are binding visual references. The implementation must preserve their open editorial layout, true near-black background, porcelain display type, neutral grotesk UI type, thin architectural rules, restrained molten-red heat accents, acid-lime state accents, and limited obsidian material imagery.

The verification reference intentionally contains no card fields. Auralis redirects candidates to a hosted third-party payment portal and never receives or stores card details.

## Launch Roles

All roles are senior, remote, worldwide independent-contractor engagements. Initial public-facing hourly bands are:

| Role | Initial rate band |
| --- | --- |
| Senior AI Product Engineer | EUR 85-120/hour |
| Senior Creative Frontend Developer | EUR 65-95/hour |
| Senior Full-Stack Product Engineer | EUR 70-105/hour |
| Senior Product Designer | EUR 60-90/hour |
| Senior Brand and Visual Systems Designer | EUR 55-85/hour |
| Senior Product Strategy and Delivery Lead | EUR 80-115/hour |

Rates are role copy and may be changed in one role-configuration file without changing application behavior. Final offers depend on scope, availability, experience, and contractor location. The interface must use contractor language and must not describe these engagements as employment.

## Candidate Journey

### 1. Campaign entry

Each Instagram campaign links directly to one unlisted role URL. There is no public careers directory and no jobs navigation on the main site.

URL shape:

`/apply/:roleSlug/:campaignToken`

The campaign token identifies an active role campaign and can be revoked. Hiring routes are excluded from the sitemap and receive `noindex, nofollow` metadata plus an `X-Robots-Tag` response header.

The URL is unlisted rather than secret: anyone who receives a valid campaign link can open it. Security does not depend on obscurity.

### 2. Short application

The application collects only:

- Full name
- Email address
- Country
- Time zone
- Portfolio, LinkedIn, or GitHub URL
- Weekly availability band
- CV upload
- Required privacy acknowledgement

The CV input accepts PDF only, with a 5 MB maximum. Restricting the first release to PDF reduces file-handling risk and replaces the broader PDF/DOCX copy shown in the early concept.

Portfolio URL requirements are role-configurable. It is required for design and frontend roles and optional for engineering and strategy roles.

On successful submission, the system creates the application, stores the CV in private storage, emails a single-use assessment link to the candidate, and immediately sends a new-application notification to `hello@auralis.studio`. This first recruiter email ensures every submitted CV reaches human review even if the candidate never finishes the assessment or card verification.

### 3. Private assessment

Assessment URL:

`/assessment/:singleUseToken`

Rules:

- One role-specific assessment per application
- 18 manually authored MCQs
- 20-minute server-authoritative timer
- One answer per question
- No typing or free-text answers
- Question order randomized per attempt
- Answer-option order randomized where the question permits it
- Answers saved after each selection
- One final submission
- Link expires 72 hours after issuance
- One reminder email after 24 hours if the assessment has not started
- No score, pass/fail message, or answer explanations shown to the candidate

Each assessment covers four dimensions: role craft, systems/problem solving, professional judgment, and delivery/collaboration. The score and dimension breakdown are included in the recruiter email, but there is no automatic rejection threshold.

When the assessment is submitted, its result is locked and a completion update is sent to `hello@auralis.studio` before the candidate enters payment verification.

### 4. Hosted payment verification

The Auralis verification screen explains the process and sends the candidate to TBC E-Commerce hosted checkout. Auralis renders no card fields.

The first production payment adapter uses:

- Amount: EUR 2.99
- Currency: EUR
- `preAuth: true`
- `saveCard: false`
- Language: English
- A role-neutral description such as `Application verification`
- TBC-hosted approval URL
- Auralis return URL
- Auralis server callback URL

The TBC merchant account must have EUR and preauthorization enabled before production activation.

The callback body is not trusted as proof. The server receives the TBC payment ID, retrieves payment details from TBC, verifies that the amount, currency, merchant reference, and preauthorization state match the application, and then calls the TBC cancel endpoint. Cancellation is idempotent and retried from persisted state if the first request fails.

The browser return URL is never authoritative. It only displays current server state and polls for the verified callback/cancellation result.

Candidate-facing language must state:

- The amount is temporarily authorized, not captured.
- Auralis requests cancellation immediately after verification.
- The issuing bank controls when a pending hold disappears.
- Verification does not affect score, review order, eligibility, or hiring outcome.

If cancellation is still processing after two minutes, the candidate sees a neutral processing state and receives completion email when cancellation is confirmed. The application remains available for human review regardless of payment status. A persistent cancellation failure alerts `hello@auralis.studio` and stays in the retry queue.

### 5. Completion

After cancellation is confirmed, the completion screen shows:

- CV received
- Assessment submitted
- Card authorization cancelled
- Application reference
- Candidate email confirmation
- A concise explanation of what happens next
- Return to Auralis action

It must not claim that the candidate passed, show a score, promise an interview, or guarantee a response time.

## Recruiter Workflow Without a Dashboard

There is no recruiter dashboard in the first release.

`hello@auralis.studio` receives three transactional messages:

1. New application: candidate details, role, campaign, availability, and secure CV link.
2. Assessment submitted: total score, dimension breakdown, completion time, and application reference.
3. Verification completed or failed: final verification state and any operational action required.

The CV email link contains a recruiter bearer token valid for 30 days. The endpoint exchanges that token for a five-minute signed storage URL. The token is stored only as a hash. Emails never contain the CV as an attachment.

Candidate messages are sent from `Auralis Careers <careers@auralis.studio>`:

- Assessment invitation
- One assessment reminder when applicable
- Application completion or verification-processing confirmation

Email delivery failures are persisted and retried. They do not delete or duplicate an application.

## System Architecture

### Frontend

- Existing React/Vite application
- React Router for hiring routes and current marketing-home composition
- Shared Auralis design tokens and pointer behavior where appropriate
- Hiring screens implemented as focused route-level components
- Payment provider presented only through a redirect handoff

### Server

- Vercel Functions under `api/`
- Server-side validation for every state transition
- Provider adapters for storage, email, anti-abuse, and hosted payment
- TBC E-Commerce as the first payment adapter
- Idempotency keys on application creation, assessment submission, payment creation, callback processing, cancellation, and email dispatch

### Data and storage

- Supabase Postgres for application state
- Supabase private Storage bucket for CVs
- Service-role credentials used only in server functions
- Browser uploads through short-lived signed upload URLs
- No direct public database or storage access

### Email and abuse protection

- Resend for transactional email
- Cloudflare Turnstile on application submission
- Campaign-token validation
- Per-IP and per-email rate limits using salted daily IP hashes
- Duplicate applications for the same email, role, and campaign within 30 days return the existing application flow instead of creating a new candidate record

## Data Model

### `roles`

Stores role slug, title, contractor copy, rate band, portfolio requirement, active state, and assessment definition version.

### `campaigns`

Stores campaign token hash, role ID, campaign label, activation and expiry dates, and revoked state.

### `applications`

Stores application reference, role/campaign IDs, candidate fields, CV object key, lifecycle state, consent timestamp, created/updated timestamps, and deletion deadline.

### `assessment_sessions`

Stores application ID, token hash, assessment version, ordered question IDs, start/expiry/submission timestamps, timer state, raw score, and dimension scores.

### `assessment_responses`

Stores assessment session, question ID, selected option ID, correctness snapshot, and save timestamp. Correctness is evaluated from the versioned question definition, not from client data.

### `payment_verifications`

Stores application ID, provider, merchant payment reference, provider payment ID, amount/currency, provider state, cancellation state, attempt count, callback timestamps, and last error category. It stores no card data.

### `email_events`

Stores application ID, message type, recipient, provider message ID, idempotency key, status, attempts, and timestamps.

### `access_tokens`

Stores hashed assessment, recruiter-download, return, and recovery tokens with scope, expiry, use count, and revocation timestamp.

## Application State Machine

Valid forward states are:

`application_started -> application_submitted -> assessment_invited -> assessment_started -> assessment_submitted -> verification_pending -> verification_processing -> completed`

Terminal side states are:

- `assessment_expired`
- `verification_failed`
- `withdrawn`
- `deleted`

Payment state never changes recruiter priority or candidate score. Applications in `application_submitted` or later remain reviewable.

## API Surface

- `GET /api/campaigns/:roleSlug/:campaignToken`
- `POST /api/applications/upload-url`
- `POST /api/applications`
- `GET /api/assessments/:token`
- `PUT /api/assessments/:token/answers/:questionId`
- `POST /api/assessments/:token/start`
- `POST /api/assessments/:token/submit`
- `POST /api/verifications/:token/session`
- `POST /api/payments/tbc/callback`
- `GET /api/verifications/:token/status`
- `GET /api/recruiter/cv/:token`
- `POST /api/privacy/delete-request`

All mutation endpoints accept an idempotency key and return structured error codes suitable for inline UI recovery.

## Error Handling

- Invalid or revoked campaign: show an unavailable-role screen without exposing whether a token once existed.
- CV upload failure: preserve form fields locally and allow retry; do not create a submitted application until the CV object is confirmed.
- Assessment network failure: keep the selected answer locally, retry save, and prevent final submission until all saves are acknowledged.
- Assessment timer expiry: server submits saved answers and locks the session.
- Email failure: queue retry with bounded exponential backoff and alert after the final attempt.
- Payment portal abandonment: keep `verification_pending`; assessment and CV remain available for review.
- Payment callback duplication: return success after idempotently confirming the existing state.
- Cancellation delay: show processing, continue server retries, and email the candidate only after authoritative confirmation.

## Privacy and Retention

- Collect only role-relevant data.
- Do not parse CVs or make automated hiring decisions.
- Do not use candidate data for marketing.
- Keep CVs and identifiable application data for 180 days after the last application activity, then delete them automatically.
- Allow candidates to request earlier deletion through the privacy endpoint.
- Keep only anonymized aggregate assessment statistics after deletion.
- Record consent text version and timestamp.
- Update the site privacy notice with hiring-purpose processing, providers, retention, candidate rights, and international data-transfer language before production launch.

## Accessibility and Responsive Behavior

- Every field has a persistent label and associated error text.
- MCQs use a semantic radio group and remain fully keyboard operable.
- Focus states use the signal-lime accent and are never color-only.
- Timer announcements occur at meaningful thresholds, not every second.
- Error summaries receive focus after failed submission.
- Reduced-motion preferences disable ornamental motion.
- Desktop preserves the approved two-column compositions.
- Mobile becomes one column with role/status context first and the primary task immediately after it.
- No fixed element may cover form actions, assessment options, payment handoff, or completion text.

## Visual System

### Color

- Background: `#070708`
- Raised black: `#0c0b0c`
- Primary text: `#f5f0e8`
- Muted text: `rgba(245, 240, 232, 0.62)`
- Rule: `rgba(245, 240, 232, 0.18)`
- Heat accent: `#ed3b31`
- Signal accent: `#c8ff24`
- Mineral accent: `#b99048`

### Typography

- Display: the same Bodoni/Didot stack used by the approved Auralis headlines
- UI: the existing neutral Avenir/Helvetica stack
- Display line height never below `0.96`
- Control and label text receives explicit sizes and weights
- Letter spacing remains `0`

### Components

- Open page bands and ruled regions rather than nested cards
- Rectangular fields with thin borders and no exaggerated radius
- Text actions with directional icons and signal-lime underlines
- Native semantic radio controls visually adapted to the approved MCQ rows
- Status rows with icon plus text, never color alone
- Lucide icons where their geometry matches the approved concepts

## Testing Strategy

### Unit tests

- Role and application validation
- Token hashing, expiry, scope, and one-use behavior
- Assessment ordering, timer, answer saves, and scoring
- Application state transitions
- Payment amount/currency/reference verification
- Idempotency behavior
- Retention-date calculation

### Integration tests

- Application plus private CV upload
- Candidate and recruiter email dispatch
- Assessment invitation, start, save, submit, and expiry
- TBC session creation through a provider test adapter
- Callback verification followed by cancellation
- Duplicate callbacks and cancellation retries
- Recruiter CV token exchange

### Browser tests

- Complete desktop candidate path
- Complete mobile candidate path
- Validation and retry states
- Keyboard-only assessment completion
- Expired and reused links
- Payment return while callback is delayed
- No horizontal overflow or overlapping text at supported breakpoints

## Deployment Requirements

Production requires these configured services and secrets:

- Supabase project, database schema, private CV bucket, service role key
- Resend account with `auralis.studio` sender-domain DNS verification
- TBC E-Commerce merchant account with EUR and preauthorization enabled
- TBC API key, client ID, client secret, callback allowlisting, and production activation
- Cloudflare Turnstile site and secret keys
- Strong application token and IP-hash secrets
- Public canonical site URL

The repository contains no live credentials. Local development and automated tests use service adapters and deterministic test implementations; production functions refuse to start with a partially configured live provider.

## Out of Scope

- Public careers directory
- Recruiter dashboard or applicant-tracking system
- Candidate accounts or passwords
- Free-text assessment answers
- AI-generated or AI-scored assessments
- Automated rejection, ranking, or job offers
- Payment-based review priority or candidate advantage
- Interview scheduling
- Contract generation, signatures, payroll, invoicing, or contractor onboarding

## External References

- TBC hosted checkout creation and preauthorization: https://developers.tbcbank.ge/docs/checkout-create-checkout-payment
- TBC payment cancellation: https://developers.tbcbank.ge/docs/checkout-cancel-checkout-payment
- TBC payment-status lookup: https://developers.tbcbank.ge/docs/checkout-get-checkout-payment-details
- Georgian Labour Code candidate-data and selection rules: https://www.matsne.gov.ge/en/document/view/1155567

