import {
  Check,
  Circle,
  Clock3,
  Copy,
  Euro,
  ExternalLink,
  FileText,
  Info,
  LockKeyhole,
  RotateCcw
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createDemoVerificationClient,
  hiringClient
} from "../api/hiringClient.js";
import HiringFlowHeader from "../components/HiringFlowHeader.jsx";
import { useVerificationStatus } from "../hooks/useVerificationStatus.js";

function validateWisePaymentUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "wise.com" ||
      url.username ||
      url.password ||
      !/^\/pay\/(?:business\/[A-Za-z0-9_-]+|r\/[A-Za-z0-9_-]+)\/?$/.test(
        url.pathname
      )
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizePayerName(value) {
  const trimmed = value.trim();
  if ([...trimmed].length < 2) {
    return { error: "Enter the name used for Wise." };
  }
  if ([...trimmed].length > 120) {
    return { error: "Use 120 characters or fewer." };
  }
  if (/[^\S ]|[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(trimmed)) {
    return { error: "Use a single-line payer name." };
  }
  return { value: trimmed };
}

async function writeToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Some embedded browsers expose the API but deny writes.
    }
  }

  const field = document.createElement("textarea");
  const activeElement = document.activeElement;
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();

  try {
    return document.execCommand?.("copy") === true;
  } finally {
    field.remove();
    activeElement?.focus?.();
  }
}

export default function VerificationPage({ client }) {
  const { token } = useParams();
  const isDemo = import.meta.env.DEV && token === "demo-verification";
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoVerificationClient("pending") : hiringClient),
    [client, isDemo]
  );
  const verification = useVerificationStatus({ token, client: activeClient });
  const [copied, setCopied] = useState(false);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [localPaymentReport, setLocalPaymentReport] = useState(null);
  const [reportError, setReportError] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    const priorTitle = document.title;
    robots?.setAttribute("content", "noindex, nofollow");
    document.title = "Application verification | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
      document.title = priorTitle;
    };
  }, []);

  async function copyReference() {
    const reference = verification.data?.applicationReference;
    if (!reference) return;
    try {
      setCopied(await writeToClipboard(reference));
    } catch {
      setCopied(false);
    }
  }

  async function submitPaymentReport(event) {
    event.preventDefault();
    const normalized = normalizePayerName(payerName);
    if (normalized.error) {
      setReportError(normalized.error);
      return;
    }

    setReportSubmitting(true);
    setReportError("");
    try {
      const result = await activeClient.reportWisePayment(
        token,
        normalized.value
      );
      setLocalPaymentReport(result);
      setReportFormOpen(false);
    } catch {
      setReportError("The payment details could not be saved. Please try again.");
    } finally {
      setReportSubmitting(false);
    }
  }

  async function retryRecruiterNotification() {
    setReportSubmitting(true);
    setReportError("");
    try {
      const result = await activeClient.reportWisePayment(token);
      setLocalPaymentReport(result);
    } catch {
      setReportError("The recruiter notification is still pending. Try again.");
    } finally {
      setReportSubmitting(false);
    }
  }

  if (verification.status === "loading") {
    return (
      <main className="hiring-page verification-page">
        <HiringFlowHeader label="Application verification" />
        <section className="hiring-loading" aria-live="polite">
          <span />
          <p>Preparing secure verification</p>
        </section>
      </main>
    );
  }

  if (verification.status === "error") {
    return (
      <main className="hiring-state-page verification-page">
        <HiringFlowHeader label="Application verification" />
        <section className="hiring-state-content assessment-state-content">
          <span className="hiring-state-icon" aria-hidden="true"><Info size={22} /></span>
          <h1>Verification unavailable</h1>
          <p>This private verification link cannot be opened. Contact Auralis for assistance.</p>
        </section>
      </main>
    );
  }

  const data = verification.data;
  const amount = "€2.99";
  const paymentReport = localPaymentReport ?? data.paymentReport ?? {
    state: "not_reported",
    reportedAt: null
  };
  const paymentReportState = paymentReport.state;
  const paymentUrl =
    data?.checkoutAvailable &&
    data?.payment?.provider === "wise" &&
    data?.payment?.mode === "manual"
      ? validateWisePaymentUrl(data.payment.url)
      : null;
  const paymentStatusLabel =
    paymentReportState === "reported"
      ? "Payment details received"
      : paymentReportState === "notification_pending"
        ? "Payment details saved"
        : paymentUrl
          ? "Manual Wise payment"
          : "Payment link unavailable";

  return (
    <main className="hiring-page verification-page">
      <HiringFlowHeader label="Application verification" />
      <div className="verification-shell">
        <section className="verification-overview" aria-labelledby="verification-title">
          <div className="verification-overview-content">
            <h1 id="verification-title">One final step<span aria-hidden="true">.</span></h1>
            <span className="hiring-role-accent" aria-hidden="true" />
            <p>
              Use Wise to send {amount} for manual application verification.
            </p>
            <p>
              Select EUR and enter {amount}. Add your application reference in Wise&apos;s Description field so Auralis can identify the payment.
            </p>
            <p>
              Wise does not confirm this step to Auralis automatically. The refund is initiated manually after reconciliation, and refund timing varies. This never changes your assessment result, review order, eligibility, or contractor selection outcome.
            </p>

            <div className="verification-application-status">
              <h2>Application status</h2>
              <div><Check size={18} aria-hidden="true" /><span>CV received</span></div>
              <div><Check size={18} aria-hidden="true" /><span>Assessment complete</span></div>
              <div className={paymentReportState === "reported" ? undefined : "is-pending"}>
                {paymentReportState === "reported" ? (
                  <Check size={18} aria-hidden="true" />
                ) : (
                  <Circle size={18} aria-hidden="true" />
                )}
                <span>{paymentStatusLabel}</span>
              </div>
            </div>
          </div>
          <div className="verification-overview-art" aria-hidden="true">
            <img src="/assets/auralis-obsidian-hero.png" alt="" />
          </div>
        </section>

        <section className="verification-portal" aria-labelledby="portal-title">
          <div className="verification-portal-inner">
            {paymentReportState === "not_reported" ? (
              <>
                <h2 id="portal-title">Pay with Wise</h2>
                <div className="verification-portal-copy">
                  <p>Open Wise in a new tab and choose EUR as the payment currency.</p>
                  <p>Enter 2.99, then paste your application reference into Description.</p>
                  <p>Auralis matches the payment and handles the refund manually.</p>
                </div>

                <div className="verification-summary">
                  <div className="verification-summary-amount">
                    <span>Amount to enter</span><strong>{amount}</strong>
                  </div>
                  <div><Euro size={22} aria-hidden="true" /><span>Currency: <strong>EUR</strong></span></div>
                  <div className="verification-reference-row">
                    <FileText size={22} aria-hidden="true" />
                    <span>Wise Description: <strong>{data.applicationReference}</strong></span>
                    <button
                      className="verification-copy"
                      type="button"
                      onClick={copyReference}
                      aria-label={copied ? "Application reference copied" : "Copy application reference"}
                      title={copied ? "Reference copied" : "Copy application reference"}
                    >
                      {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                    </button>
                  </div>
                  <div><RotateCcw size={22} aria-hidden="true" /><span>Refund initiated manually by Auralis</span></div>
                  <div><Clock3 size={22} aria-hidden="true" /><span>Refund arrival depends on Wise and the payment method</span></div>
                </div>

                <div className="verification-action-block">
                  <p>
                    <LockKeyhole size={22} aria-hidden="true" />
                    Wise opens in a new tab. Keep this page for the reference.
                  </p>
                  {!paymentUrl ? (
                    <div className="verification-action-error" role="status">
                      The payment link is currently unavailable. Your application remains submitted and review is not affected.
                    </div>
                  ) : (
                    <div className="verification-manual-note" role="note">
                      Refunds are not instant. Processing time depends on Wise and the original payment method.
                    </div>
                  )}
                  {paymentUrl ? (
                    <div className="verification-action-stack">
                      <a
                        className="verification-action"
                        href={paymentUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open Wise payment link
                        <ExternalLink size={23} aria-hidden="true" />
                      </a>
                      <button
                        className="verification-secondary-action"
                        type="button"
                        onClick={() => {
                          setReportFormOpen(true);
                          setReportError("");
                        }}
                      >
                        I&apos;ve completed the Wise payment
                        <Check size={20} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {reportFormOpen ? (
                  <form
                    className="verification-report-form"
                    onSubmit={submitPaymentReport}
                    noValidate
                  >
                    <div className="verification-report-context" aria-label="Wise payment details">
                      <div><span>Amount</span><strong>EUR 2.99</strong></div>
                      <div><span>Application reference</span><strong>{data.applicationReference}</strong></div>
                    </div>
                    <div className="verification-report-field">
                      <label htmlFor="wise-payer-name">Name used for the Wise payment</label>
                      <input
                        id="wise-payer-name"
                        name="payerName"
                        type="text"
                        autoComplete="name"
                        value={payerName}
                        aria-invalid={Boolean(reportError)}
                        aria-describedby="wise-report-guidance wise-report-error"
                        onChange={(event) => {
                          setPayerName(event.target.value);
                          setReportError("");
                        }}
                      />
                      {reportError ? (
                        <small id="wise-report-error" role="alert">{reportError}</small>
                      ) : null}
                    </div>
                    <p id="wise-report-guidance" className="verification-report-guidance">
                      Submitting these details does not prove Wise completed the transaction. Auralis compares the name, amount, and submission time with Wise activity.
                    </p>
                    <button
                      className="verification-report-command"
                      type="submit"
                      disabled={reportSubmitting}
                    >
                      {reportSubmitting ? "Saving details" : "Submit payment details"}
                      <Check size={20} aria-hidden="true" />
                    </button>
                  </form>
                ) : null}
              </>
            ) : (
              <div className="verification-report-state" aria-live="polite">
                <h2 id="portal-title">
                  {paymentReportState === "reported"
                    ? "Payment details received"
                    : "Payment details saved"}
                </h2>
                <p className="verification-report-state-lead">
                  {paymentReportState === "reported"
                    ? "Your application is complete. Auralis will manually match the EUR 2.99 payment and initiate the refund. No further action is required."
                    : "Payment details saved. Recruiter notification is pending."}
                </p>
                {paymentReportState === "reported" ? (
                  <p className="verification-report-application-note">
                    Your application remains under independent review based on your experience, accomplishments, skills, and assessment. Submitting payment details does not influence the hiring decision. Auralis will contact you if your application progresses.
                  </p>
                ) : null}
                <div className="verification-report-context verification-report-context-stored">
                  <div><span>Payment amount</span><strong>EUR 2.99</strong></div>
                  <div><span>Application reference</span><strong>{data.applicationReference}</strong></div>
                </div>
                <p className="verification-report-timing">
                  Refund arrival depends on Wise and the original payment method.
                </p>
                <p className="verification-report-correction">
                  Need to correct the payer name? Email <a href="mailto:auralis.careers@proton.me">auralis.careers@proton.me</a>.
                </p>
                {reportError ? <p className="verification-report-error" role="alert">{reportError}</p> : null}
                {paymentReportState === "notification_pending" ? (
                  <button
                    className="verification-report-command verification-report-retry"
                    type="button"
                    disabled={reportSubmitting}
                    onClick={retryRecruiterNotification}
                  >
                    {reportSubmitting ? "Retrying notification" : "Retry recruiter notification"}
                    <RotateCcw size={20} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
