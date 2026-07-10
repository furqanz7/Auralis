import { ArrowRight, Check, CircleAlert, Clock3 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  createDemoVerificationClient,
  hiringClient
} from "../api/hiringClient.js";
import HiringFlowHeader from "../components/HiringFlowHeader.jsx";
import { useVerificationStatus } from "../hooks/useVerificationStatus.js";

function ProcessingState({ failed = false }) {
  return (
    <main className="hiring-state-page verification-page">
      <HiringFlowHeader label="Application verification" />
      <section className="hiring-state-content assessment-state-content">
        <span className="hiring-state-icon" aria-hidden="true">
          {failed ? <CircleAlert size={22} /> : <Clock3 size={22} />}
        </span>
        <h1>{failed ? "Verification needs attention" : "Verification is processing"}</h1>
        <p>
          {failed
            ? "The hosted verification could not be confirmed. Your application remains available for human review, and Auralis will contact you if action is needed."
            : "The provider confirmation has not reached us yet. Your application remains available for human review while server confirmation continues."}
        </p>
      </section>
    </main>
  );
}

export default function ApplicationCompletePage({ client, pollInterval = 2000 }) {
  const { returnToken } = useParams();
  const isDemo = import.meta.env.DEV && returnToken === "demo-complete";
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoVerificationClient("completed") : hiringClient),
    [client, isDemo]
  );
  const verification = useVerificationStatus({
    token: returnToken,
    client: activeClient,
    pollInterval
  });

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    const priorTitle = document.title;
    robots?.setAttribute("content", "noindex, nofollow");
    document.title = "Application complete | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
      document.title = priorTitle;
    };
  }, []);

  if (verification.status === "loading") {
    return (
      <main className="hiring-page verification-page">
        <HiringFlowHeader label="Application complete" />
        <section className="hiring-loading" aria-live="polite">
          <span />
          <p>Confirming verification</p>
        </section>
      </main>
    );
  }
  if (verification.status === "failed" || verification.status === "error") {
    return <ProcessingState failed />;
  }
  if (verification.status !== "completed") return <ProcessingState />;

  const data = verification.data;
  return (
    <main className="hiring-page completion-page">
      <HiringFlowHeader label="Application complete" />
      <div className="completion-shell">
        <section className="completion-message" aria-labelledby="completion-title">
          <h1 id="completion-title">Your application is with us<span aria-hidden="true">.</span></h1>
          <span className="hiring-role-accent" aria-hidden="true" />
          <p>Thank you for completing the {data.role.title} assessment.</p>
          <p>We review every application individually against the role's experience, skills, and accomplishment criteria.</p>
          <div className="completion-next">
            <h2>What happens next</h2>
            <p>If your profile matches the role, Auralis will contact you by email with the next step.</p>
          </div>

          <a className="completion-return" href="/" data-no-barba>
            Return to Auralis <ArrowRight size={24} aria-hidden="true" />
          </a>
        </section>

        <section className="completion-status" aria-label="Submission status">
          <div className="completion-status-inner">
            <h2>Submission status</h2>
            <div><Check size={19} aria-hidden="true" /><span>CV received</span></div>
            <div><Check size={19} aria-hidden="true" /><span>Assessment submitted</span></div>
            <div><Check size={19} aria-hidden="true" /><span>Temporary authorization cancelled</span></div>
            <p className="completion-reference">Application {data.applicationReference}</p>
            <p className="completion-bank-note">Your bank controls when a pending authorization disappears from your account.</p>
          </div>
          <div className="completion-art" aria-hidden="true">
            <img src="/assets/auralis-obsidian-hero.png" alt="" />
          </div>
        </section>
      </div>
    </main>
  );
}
