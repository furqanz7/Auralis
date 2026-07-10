import { Check, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { hiringClient } from "../api/hiringClient.js";

export default function PrivacyDeletionPage({ client = hiringClient }) {
  const { token } = useParams();
  const [state, setState] = useState("ready");

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    const priorTitle = document.title;
    robots?.setAttribute("content", "noindex, nofollow");
    document.title = "Confirm application deletion | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
      document.title = priorTitle;
    };
  }, []);

  async function confirmDeletion() {
    if (state === "deleting") return;
    setState("deleting");
    try {
      await client.confirmPrivacyDeletion(token);
      setState("deleted");
    } catch (error) {
      setState(error?.code === "DELETION_RETRY_PENDING" ? "retry" : "invalid");
    }
  }

  return (
    <main className="hiring-state-page privacy-confirm-page">
      <header className="privacy-confirm-header">
        <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
        <span>Private deletion request</span>
      </header>

      <section className="privacy-confirm-shell" aria-live="polite">
        {state === "deleted" ? (
          <div className="privacy-confirm-content is-complete">
            <span className="privacy-confirm-icon"><Check size={25} aria-hidden="true" /></span>
            <p className="privacy-confirm-kicker">Request complete</p>
            <h1>Application deleted</h1>
            <p>
              Your contractor application and CV have been deleted. Auralis retains only an anonymous role-and-month count that cannot be used to restore your application.
            </p>
            <a href="/" data-no-barba>Return to Auralis</a>
          </div>
        ) : (
          <div className="privacy-confirm-content">
            <span className="privacy-confirm-icon"><ShieldAlert size={25} aria-hidden="true" /></span>
            <p className="privacy-confirm-kicker">Explicit confirmation required</p>
            <h1>Delete your application</h1>
            <p>
              This permanently removes your contractor application, CV, assessment records, and verification references. It cannot be undone.
            </p>
            <div className="privacy-confirm-rule">
              <span>Opening this page did not delete anything.</span>
              <span>Deletion begins only when you confirm below.</span>
            </div>
            {state === "retry" ? (
              <p className="privacy-confirm-error" role="alert">
                Deletion could not be completed safely. Your records remain intact and a retry has been scheduled. Please try again later or contact auralis.careers@proton.me.
              </p>
            ) : null}
            {state === "invalid" ? (
              <p className="privacy-confirm-error" role="alert">
                This private link is invalid or has expired. Request a new link from the privacy policy page.
              </p>
            ) : null}
            <button
              type="button"
              className="privacy-confirm-button"
              onClick={confirmDeletion}
              disabled={state === "deleting" || state === "invalid"}
            >
              <Trash2 size={20} aria-hidden="true" />
              {state === "deleting" ? "Deleting application" : "Permanently delete application"}
            </button>
            <a href="/privacy" data-no-barba>Cancel and return to privacy policy</a>
          </div>
        )}
        <div className="privacy-confirm-art" aria-hidden="true">
          <img src="/assets/auralis-obsidian-hero.png" alt="" />
        </div>
      </section>
    </main>
  );
}
