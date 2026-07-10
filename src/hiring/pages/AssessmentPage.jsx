import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  LockKeyhole
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  createDemoAssessmentClient,
  hiringClient
} from "../api/hiringClient.js";
import AssessmentQuestion from "../components/AssessmentQuestion.jsx";
import { useAssessmentSession } from "../hooks/useAssessmentSession.js";

function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 20 * 60);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function timerUrgency(seconds) {
  if (seconds <= 30) return "critical";
  if (seconds <= 120) return "warning";
  return "normal";
}

function AssessmentHeader({ activeIndex, total, remainingSeconds, active }) {
  return (
    <header className="assessment-header">
      <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
      <div className="assessment-header-meta">
        <span>Private assessment</span>
        {active ? (
          <>
            <span className="assessment-header-count">
              <b>{String(activeIndex + 1).padStart(2, "0")}</b> / {String(total).padStart(2, "0")}
            </span>
            <span className="assessment-header-divider" aria-hidden="true" />
            <span
              className="assessment-timer"
              data-urgency={timerUrgency(remainingSeconds)}
              aria-label={`${formatTime(remainingSeconds)} remaining`}
            >
              <Clock3 size={17} aria-hidden="true" />
              {formatTime(remainingSeconds)}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );
}

function AssessmentState({ title, children, action, tone = "alert" }) {
  return (
    <main className="hiring-state-page assessment-state-page">
      <AssessmentHeader />
      <section className="hiring-state-content assessment-state-content">
        <span className="hiring-state-icon" aria-hidden="true">
          {tone === "check" ? <Check size={23} /> : <CircleAlert size={23} />}
        </span>
        <h1>{title}</h1>
        {children}
        {action}
      </section>
    </main>
  );
}

function Intro({ session, starting, onStart }) {
  return (
    <main className="hiring-state-page assessment-state-page">
      <AssessmentHeader />
      <section className="assessment-intro">
        <p className="assessment-intro-kicker">02 / Assessment</p>
        <h1>Your private assessment</h1>
        <p className="assessment-intro-role">{session.role.title}</p>
        <div className="assessment-intro-facts" aria-label="Assessment details">
          <span><b>{session.questionCount}</b> multiple-choice questions</span>
          <span><b>{Math.round(session.durationSeconds / 60)}</b> minutes</span>
          <span><b>One</b> submission</span>
        </div>
        <div className="assessment-intro-note">
          <LockKeyhole size={20} aria-hidden="true" />
          <p>
            This link is private. The timer begins only when you start, answers save automatically, and every question requires one choice.
          </p>
        </div>
        <button className="assessment-primary-action" type="button" onClick={onStart} disabled={starting}>
          {starting ? "Opening assessment" : "Start assessment"}
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </section>
    </main>
  );
}

export default function AssessmentPage({ client }) {
  const { token } = useParams();
  const isDemo = import.meta.env.DEV && token === "demo-assessment";
  const activeClient = useMemo(
    () => client ?? (isDemo ? createDemoAssessmentClient() : hiringClient),
    [client, isDemo]
  );
  const assessment = useAssessmentSession({ token, client: activeClient });
  const workspaceRef = useRef(null);
  const priorIndexRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("hiring-active");
    const robots = document.querySelector('meta[name="robots"]');
    const priorRobots = robots?.getAttribute("content");
    const priorTitle = document.title;
    robots?.setAttribute("content", "noindex, nofollow");
    document.title = "Private assessment | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      if (robots && priorRobots) robots.setAttribute("content", priorRobots);
      document.title = priorTitle;
    };
  }, []);

  useEffect(() => {
    if (assessment.status !== "active") return;
    if (priorIndexRef.current === null) {
      priorIndexRef.current = assessment.activeIndex;
      return;
    }
    if (priorIndexRef.current === assessment.activeIndex) return;
    priorIndexRef.current = assessment.activeIndex;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    workspaceRef.current?.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start"
    });
  }, [assessment.activeIndex, assessment.status]);

  if (assessment.status === "loading") {
    return (
      <main className="hiring-page assessment-page">
        <AssessmentHeader />
        <section className="hiring-loading" aria-live="polite">
          <span />
          <p>Opening private assessment</p>
        </section>
      </main>
    );
  }

  if (assessment.status === "invited" || assessment.status === "starting") {
    return (
      <Intro
        session={assessment.session}
        starting={assessment.status === "starting"}
        onStart={assessment.start}
      />
    );
  }

  if (assessment.status === "submitted") {
    if (assessment.result?.verificationToken) {
      return (
        <Navigate
          replace
          to={`/verify/${encodeURIComponent(assessment.result.verificationToken)}`}
        />
      );
    }
    return (
      <AssessmentState title="Assessment submitted" tone="check">
        <p>
          Your responses are securely recorded
          {assessment.result?.applicationReference ? (
            <> under reference <strong>{assessment.result.applicationReference}</strong></>
          ) : null}. Auralis will continue the human review and contact you by email.
        </p>
      </AssessmentState>
    );
  }

  if (assessment.status === "expired") {
    return (
      <AssessmentState title="Assessment closed">
        <p>
          The twenty-minute window has ended. Saved responses were securely recorded for human review.
        </p>
      </AssessmentState>
    );
  }

  if (assessment.status === "unavailable") {
    return (
      <AssessmentState title="Assessment unavailable">
        <p>This private assessment link cannot be opened. Contact Auralis for a current link.</p>
      </AssessmentState>
    );
  }

  const { session, currentQuestion } = assessment;
  if (!session || !currentQuestion) return null;
  const total = assessment.questions.length;
  const finalQuestion = assessment.activeIndex === total - 1;
  const pending = assessment.status === "submitting";
  const progress = total ? (assessment.answeredCount / total) * 100 : 0;

  return (
    <main className="hiring-page assessment-page">
      <AssessmentHeader
        active
        activeIndex={assessment.activeIndex}
        total={total}
        remainingSeconds={assessment.remainingSeconds}
      />
      <div className="assessment-shell">
        <aside className="assessment-rail" aria-label="Assessment progress">
          <div className="assessment-rail-content">
            <h2>{session.role.title}</h2>
            <span className="hiring-role-accent" aria-hidden="true" />

            <div className="assessment-progress-block">
              <p>Progress</p>
              <div className="assessment-progress-track" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="assessment-progress-numbers">
                <span>{assessment.answeredCount} answered</span>
                <span>{total - assessment.answeredCount} remaining</span>
              </div>
            </div>

            <div className="assessment-rail-rule">
              <span aria-hidden="true" />
              <div>
                <p>Assessment rules</p>
                <small><LockKeyhole size={18} aria-hidden="true" />This link is private and can be submitted once.</small>
              </div>
            </div>

            <div className="assessment-rail-rule assessment-save-status" aria-live="polite">
              <span aria-hidden="true" />
              <div>
                <p>Status</p>
                {assessment.saveState === "saved" ? (
                  <small><Check size={18} aria-hidden="true" />Answer saved</small>
                ) : assessment.saveState === "saving" ? (
                  <small><span className="assessment-saving-dot" aria-hidden="true" />Saving answer</small>
                ) : assessment.saveState === "error" ? (
                  <small className="is-error">
                    <CircleAlert size={18} aria-hidden="true" />Answer not saved
                  </small>
                ) : (
                  <small><span className="assessment-empty-dot" aria-hidden="true" />Answers save automatically</small>
                )}
              </div>
            </div>
          </div>
          <div className="assessment-rail-art" aria-hidden="true">
            <img src="/assets/auralis-obsidian-hero.png" alt="" />
          </div>
        </aside>

        <section className="assessment-workspace" ref={workspaceRef}>
          <AssessmentQuestion
            question={currentQuestion}
            value={assessment.responses[currentQuestion.id]}
            saveState={assessment.saveState}
            disabled={pending}
            onSelect={assessment.selectAnswer}
          />

          {assessment.saveState === "error" ? (
            <div className="assessment-inline-error" role="alert">
              <span>The answer could not be saved.</span>
              <button type="button" onClick={assessment.retrySave}>Retry</button>
            </div>
          ) : null}

          <nav className="assessment-actions" aria-label="Question navigation">
            <button
              className="assessment-back"
              type="button"
              onClick={assessment.goBack}
              disabled={assessment.activeIndex === 0 || pending}
            >
              <ArrowLeft size={25} aria-hidden="true" />
              Back
            </button>
            <button
              className="assessment-next"
              type="button"
              onClick={finalQuestion ? assessment.submit : assessment.goNext}
              disabled={!assessment.canContinue || pending}
            >
              {pending ? "Submitting" : finalQuestion ? "Submit assessment" : "Next question"}
              <ArrowRight size={25} aria-hidden="true" />
            </button>
          </nav>
        </section>
      </div>
    </main>
  );
}
