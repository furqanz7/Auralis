import {
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Info,
  LockKeyhole,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createDemoVerificationClient,
  hiringClient
} from "../api/hiringClient.js";
import HiringFlowHeader from "../components/HiringFlowHeader.jsx";
import { useVerificationStatus } from "../hooks/useVerificationStatus.js";

const SESSION_KEY = "auralis:hiring:verification-session";

function createIdempotencyKey() {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `verification-${suffix}`;
}

function stableSessionKey(applicationReference) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (
      stored?.applicationReference === applicationReference &&
      typeof stored?.idempotencyKey === "string"
    ) {
      return stored.idempotencyKey;
    }
  } catch {
    // A new key is safe when session storage is unavailable.
  }
  const idempotencyKey = createIdempotencyKey();
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ applicationReference, idempotencyKey })
    );
  } catch {
    // The server still enforces idempotency for this request.
  }
  return idempotencyKey;
}

function validateApprovalUrl(value, expectedHost) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== expectedHost.toLowerCase() ||
      url.username ||
      url.password
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error("HOSTED_URL_INVALID");
  }
}

export default function VerificationPage({
  client,
  navigateExternal = (url) => window.location.assign(url),
  expectedCheckoutHost = import.meta.env.VITE_TBC_CHECKOUT_HOST ?? "tpay.tbcbank.ge"
}) {
  const { token } = useParams();
  const isDemo = import.meta.env.DEV && token === "demo-verification";
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoVerificationClient("pending") : hiringClient),
    [client, isDemo]
  );
  const verification = useVerificationStatus({ token, client: activeClient });
  const [actionState, setActionState] = useState("idle");
  const [actionError, setActionError] = useState("");

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

  async function beginVerification() {
    if (actionState === "opening" || !verification.data) return;
    setActionState("opening");
    setActionError("");
    try {
      const session = await activeClient.createVerificationSession(
        token,
        stableSessionKey(verification.data.applicationReference)
      );
      navigateExternal(
        validateApprovalUrl(session.approvalUrl, expectedCheckoutHost)
      );
    } catch {
      setActionState("error");
      setActionError(
        "The secure payment portal could not be opened. Please try again."
      );
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
  const amount = data?.verification?.amountMinor === 299 ? "€2.99" : "€2.99";
  const processing = verification.status === "processing";
  const checkoutAvailable = data?.checkoutAvailable !== false;
  const verificationStatusLabel = processing
    ? "Verification processing"
    : checkoutAvailable
      ? "Payment verification pending"
      : "Payment portal unavailable";
  const actionLabel = !checkoutAvailable
    ? "Payment portal unavailable"
    : actionState === "opening"
      ? "Opening secure portal"
      : processing
        ? "Verification processing"
        : "Continue to payment portal";

  return (
    <main className="hiring-page verification-page">
      <HiringFlowHeader label="Application verification" />
      <div className="verification-shell">
        <section className="verification-overview" aria-labelledby="verification-title">
          <div className="verification-overview-content">
            <h1 id="verification-title">One final verification<span aria-hidden="true">.</span></h1>
            <span className="hiring-role-accent" aria-hidden="true" />
            <p>
              We use a temporary {amount} payment authorization to reduce automated and duplicate submissions.
            </p>
            <p>
              The amount is not captured. We cancel the authorization immediately after the provider confirms it, although your bank may take longer to display the released hold.
            </p>
            <p>
              This verification never changes your assessment result, review order, eligibility, or contractor selection outcome.
            </p>

            <div className="verification-application-status">
              <h2>Application status</h2>
              <div><Check size={18} aria-hidden="true" /><span>CV received</span></div>
              <div><Check size={18} aria-hidden="true" /><span>Assessment complete</span></div>
              <div className="is-pending"><Circle size={18} aria-hidden="true" /><span>{verificationStatusLabel}</span></div>
            </div>
          </div>
          <div className="verification-overview-art" aria-hidden="true">
            <img src="/assets/auralis-obsidian-hero.png" alt="" />
          </div>
        </section>

        <section className="verification-portal" aria-labelledby="portal-title">
          <div className="verification-portal-inner">
            <h2 id="portal-title">Secure verification portal</h2>
            <div className="verification-portal-copy">
              {checkoutAvailable ? (
                <>
                  <p>You will continue to our payment provider to authorize {amount}.</p>
                  <p>The provider handles payment details. Auralis never receives or stores them.</p>
                  <p>After verification, you will return here automatically.</p>
                </>
              ) : (
                <>
                  <p>The hosted payment portal is temporarily unavailable.</p>
                  <p>Your application and assessment remain securely submitted.</p>
                  <p>Human review is not affected by payment verification availability.</p>
                </>
              )}
            </div>

            <div className="verification-summary">
              <div className="verification-summary-amount">
                <span>Temporary authorization</span><strong>{amount}</strong>
              </div>
              <div><Clock3 size={22} aria-hidden="true" /><span>Not captured</span></div>
              <div><X size={22} aria-hidden="true" /><span>Cancelled immediately after confirmation</span></div>
              <div><Info size={22} aria-hidden="true" /><span>Bank release timing may vary</span></div>
            </div>

            <div className="verification-action-block">
              <p>
                <LockKeyhole size={22} aria-hidden="true" />
                {checkoutAvailable
                  ? "Opens our secure payment provider"
                  : "Hosted provider setup required"}
              </p>
              {!checkoutAvailable ? (
                <div className="verification-action-error" role="status">
                  Payment verification is temporarily unavailable. Your application remains submitted and review is not affected.
                </div>
              ) : actionError ? (
                <div className="verification-action-error" role="alert">
                  {actionError}
                </div>
              ) : null}
              <button
                className="verification-action"
                type="button"
                onClick={beginVerification}
                disabled={!checkoutAvailable || actionState === "opening" || processing}
              >
                {actionLabel}
                <ArrowRight size={24} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
