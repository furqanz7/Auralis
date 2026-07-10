import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ApplicationForm from "../components/ApplicationForm.jsx";
import TurnstileWidget from "../components/TurnstileWidget.jsx";
import { createDemoHiringClient, hiringClient } from "../api/hiringClient.js";

const ROLE_COPY = {
  "senior-ai-product-engineer":
    "Build intelligent products where model behaviour, product judgment, and resilient engineering meet.",
  "senior-creative-frontend-developer":
    "Translate ambitious art direction into fast, accessible interfaces with exceptional motion and detail.",
  "senior-full-stack-product-engineer":
    "Shape dependable products across interface, API, data, and production operations.",
  "senior-product-designer":
    "Turn complex product questions into lucid systems, decisive flows, and thoughtful interaction.",
  "senior-brand-visual-systems-designer":
    "Build distinctive visual languages that remain coherent across products, motion, and every channel.",
  "senior-product-strategy-delivery-lead":
    "Guide difficult product work from opportunity framing through calm, accountable delivery."
};

function PrivateHeader() {
  return (
    <header className="hiring-header">
      <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
      <div className="hiring-progress">
        <h1>Private application</h1>
        <span><b>01</b> / 03</span>
      </div>
    </header>
  );
}

function RolePanel({ role }) {
  return (
    <section className="hiring-role-panel" aria-labelledby="hiring-role-title">
      <div className="hiring-role-content">
        <h2 id="hiring-role-title">{role.title}</h2>
        <span className="hiring-role-accent" aria-hidden="true" />
        <p className="hiring-role-meta">
          {role.engagement} <i aria-hidden="true" /> {role.location}
        </p>
        <p className="hiring-role-rate">
          EUR {role.rateMin}-{role.rateMax} / hour
        </p>
        <p className="hiring-role-summary">{ROLE_COPY[role.slug]}</p>
      </div>
      <div className="hiring-role-art" aria-hidden="true">
        <img src="/assets/auralis-obsidian-hero.png" alt="" />
      </div>
    </section>
  );
}

function ApplicationState({ title, children, icon = "alert" }) {
  return (
    <main className="hiring-state-page">
      <PrivateHeader />
      <section className="hiring-state-content">
        <span className="hiring-state-icon" aria-hidden="true">
          {icon === "check" ? <Check size={23} /> : <CircleAlert size={23} />}
        </span>
        <h2>{title}</h2>
        {children}
        <a href="/" data-no-barba>
          <ArrowLeft size={17} aria-hidden="true" />
          Return to Auralis
        </a>
      </section>
    </main>
  );
}

export default function PrivateApplicationPage({
  client,
  turnstileToken: suppliedTurnstileToken
}) {
  const { roleSlug, campaignToken } = useParams();
  const isDemo = import.meta.env.DEV && campaignToken === "demo-campaign";
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoHiringClient() : hiringClient),
    [client, isDemo]
  );
  const [state, setState] = useState({ status: "loading" });
  const [securityToken, setSecurityToken] = useState(
    suppliedTurnstileToken ?? (isDemo ? "demo-turnstile-token" : "")
  );

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    robots?.setAttribute("content", "noindex, nofollow");
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    activeClient
      .getCampaign(roleSlug, campaignToken)
      .then((campaign) => {
        if (active) {
          setState({
            status: "ready",
            campaign: { ...campaign, token: campaignToken }
          });
        }
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [activeClient, campaignToken, roleSlug]);

  const receiveToken = useCallback((token) => setSecurityToken(token), []);

  if (state.status === "unavailable") {
    return (
      <ApplicationState title="Application unavailable">
        <p>
          This campaign cannot accept an application. Request a current private link from Auralis.
        </p>
      </ApplicationState>
    );
  }

  if (state.status === "submitted") {
    return (
      <ApplicationState title="Application received" icon="check">
        <p>
          Reference <strong>{state.result.applicationReference}</strong>. Your CV is queued for human review. If your experience is a fit, Auralis will email your private assessment link directly.
        </p>
      </ApplicationState>
    );
  }

  return (
    <main className="hiring-page">
      <PrivateHeader />
      {state.status === "loading" ? (
        <section className="hiring-loading" aria-live="polite">
          <span />
          <p>Opening private application</p>
        </section>
      ) : (
        <div className="hiring-main">
          <RolePanel role={state.campaign.role} />
          <section className="hiring-form-panel" aria-label="Application details">
            <ApplicationForm
              role={state.campaign.role}
              campaign={state.campaign}
              client={activeClient}
              turnstileToken={securityToken}
              securityControl={
                !isDemo && !suppliedTurnstileToken ? (
                  import.meta.env.VITE_TURNSTILE_SITE_KEY ? (
                    <TurnstileWidget
                      siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                      onToken={receiveToken}
                    />
                  ) : (
                    <p className="hiring-security-unavailable" role="status">
                      Security verification is temporarily unavailable.
                    </p>
                  )
                ) : null
              }
              onSubmitted={(result) => setState({ status: "submitted", result })}
            />
          </section>
        </div>
      )}
    </main>
  );
}
