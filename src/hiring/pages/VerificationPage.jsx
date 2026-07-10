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
  const paymentUrl =
    data?.checkoutAvailable &&
    data?.payment?.provider === "wise" &&
    data?.payment?.mode === "manual"
      ? validateWisePaymentUrl(data.payment.url)
      : null;
  const paymentStatusLabel = paymentUrl
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
              Select EUR and enter {amount}. Add your application reference in Wise&apos;s Description field so the payment can be matched.
            </p>
            <p>
              Wise does not confirm this step to Auralis automatically. The refund is initiated manually after reconciliation, and refund timing varies. This never changes your assessment result, review order, eligibility, or contractor selection outcome.
            </p>

            <div className="verification-application-status">
              <h2>Application status</h2>
              <div><Check size={18} aria-hidden="true" /><span>CV received</span></div>
              <div><Check size={18} aria-hidden="true" /><span>Assessment complete</span></div>
              <div className="is-pending"><Circle size={18} aria-hidden="true" /><span>{paymentStatusLabel}</span></div>
            </div>
          </div>
          <div className="verification-overview-art" aria-hidden="true">
            <img src="/assets/auralis-obsidian-hero.png" alt="" />
          </div>
        </section>

        <section className="verification-portal" aria-labelledby="portal-title">
          <div className="verification-portal-inner">
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
                <a
                  className="verification-action"
                  href={paymentUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open Wise payment link
                  <ExternalLink size={23} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
