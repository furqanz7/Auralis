import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ApplicationForm from "../components/ApplicationForm.jsx";
import RolePanel from "../components/RolePanel.jsx";
import {
  createDemoApplicationClient,
  hiringClient
} from "../api/hiringClient.js";

function ApplicationHeader() {
  return (
    <header className="hiring-header">
      <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
      <div className="hiring-progress">
        <h1>Contractor application</h1>
        <span><b>01</b> / 03</span>
      </div>
    </header>
  );
}

function ApplicationState({ title, children, icon = "alert" }) {
  return (
    <main className="hiring-state-page">
      <ApplicationHeader />
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

export default function ApplicationPage({ client }) {
  const isDemo = import.meta.env.DEV;
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoApplicationClient() : hiringClient),
    [client, isDemo]
  );
  const [state, setState] = useState({ status: "loading" });
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    const priorTitle = document.title;
    robots?.setAttribute("content", "noindex, nofollow");
    document.title = "Apply | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
      document.title = priorTitle;
    };
  }, []);

  useEffect(() => {
    let active = true;
    activeClient
      .getApplicationRoles()
      .then((roles) => {
        if (!active) return;
        setState(roles.length > 0 ? { status: "ready", roles } : { status: "unavailable" });
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [activeClient]);

  if (state.status === "unavailable") {
    return (
      <ApplicationState title="Applications unavailable">
        <p>There are no contractor roles accepting applications at this time.</p>
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
      <ApplicationHeader />
      {state.status === "loading" ? (
        <section className="hiring-loading" aria-live="polite">
          <span />
          <p>Opening applications</p>
        </section>
      ) : (
        <div className="hiring-main">
          <RolePanel role={selectedRole} />
          <section className="hiring-form-panel" aria-label="Application details">
            <ApplicationForm
              roles={state.roles}
              client={activeClient}
              onRoleChange={setSelectedRole}
              onSubmitted={(result) => setState({ status: "submitted", result })}
            />
          </section>
        </div>
      )}
    </main>
  );
}
