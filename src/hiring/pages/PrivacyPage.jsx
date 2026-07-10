import { Mail, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

const POLICY_SECTIONS = [
  ["01", "Controller", "controller"],
  ["02", "Information", "information"],
  ["03", "Hiring", "hiring"],
  ["04", "Providers", "providers"],
  ["05", "Retention", "retention"],
  ["06", "Your rights", "rights"]
];

function PrivacyHeader() {
  return (
    <header className="privacy-header">
      <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
      <nav aria-label="Privacy policy">
        <a href="#information">Information</a>
        <a href="#hiring">Hiring</a>
        <a href="#rights">Your rights</a>
      </nav>
      <a className="privacy-header-contact" href="mailto:auralis.careers@proton.me">
        Contact <Mail size={15} aria-hidden="true" />
      </a>
    </header>
  );
}

function PolicySection({ id, number, title, children }) {
  return (
    <section className="privacy-policy-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="privacy-section-index" aria-hidden="true">{number}</div>
      <div className="privacy-section-copy">
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  useEffect(() => {
    document.body.classList.add("hiring-active");
    const priorTitle = document.title;
    document.title = "Privacy policy | Auralis";
    return () => {
      document.body.classList.remove("hiring-active");
      document.title = priorTitle;
    };
  }, []);

  return (
    <main className="hiring-page privacy-page">
      <PrivacyHeader />

      <section className="privacy-hero" aria-labelledby="privacy-title">
        <div className="privacy-hero-copy">
          <div className="privacy-kicker">
            <span>05 / Privacy</span>
            <span>Effective 10 July 2026</span>
          </div>
          <h1 id="privacy-title">
            Privacy, <span>without obscurity<i aria-hidden="true">.</i></span>
          </h1>
          <p>
            A clear account of what Auralis collects, why it is needed, who handles it, and the choices available to you.
          </p>
        </div>
        <div className="privacy-hero-art" aria-hidden="true">
          <img src="/assets/auralis-obsidian-hero.png" alt="" />
        </div>
        <div className="privacy-hero-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <span>Human review. Private records. Deliberate retention.</span>
        </div>
      </section>

      <div className="privacy-policy-layout">
        <aside className="privacy-policy-nav" aria-label="Policy sections">
          <p>Contents</p>
          {POLICY_SECTIONS.map(([number, label, id]) => (
            <a href={`#${id}`} key={id}>
              <span>{number}</span>{label}
            </a>
          ))}
        </aside>

        <article className="privacy-policy">
          <PolicySection id="controller" number="01" title="Who is responsible">
            <p>
              Auralis, located in Tbilisi, Georgia, is the controller responsible for the personal information described in this policy. Privacy questions and rights requests can be sent to <a href="mailto:auralis.careers@proton.me">auralis.careers@proton.me</a>.
            </p>
          </PolicySection>

          <PolicySection id="information" number="02" title="Information we handle">
            <p>
              When you contact the studio, we receive the details you choose to provide, such as your name, email address, company, project information, and correspondence.
            </p>
            <p>
              For private contractor applications, we collect your name, email, country, time zone, availability, optional profile link, selected role, CV, application timestamps, assessment responses and result, and operational records needed to protect and deliver the process.
            </p>
            <p>
              We use limited technical records for security, reliability, abuse prevention, and troubleshooting. We do not sell personal information or use contractor application data for unrelated advertising.
            </p>
          </PolicySection>

          <PolicySection id="hiring" number="03" title="Independent contractor applications">
            <p>
              Application information is used to receive your submission, deliver the private multiple-choice assessment, review your experience and skills, communicate next steps, and protect the funnel from automated or duplicate submissions.
            </p>
            <p>
              Auralis makes no automated hiring decisions. Every CV is available for human review, and assessment results support rather than replace professional judgment. The optional payment verification does not change your score, eligibility, review order, or selection outcome.
            </p>
            <p>
              The verification uses a temporary EUR 2.99 authorization in a third-party portal. It is not captured and is cancelled after provider confirmation. Your bank may take additional time to display the release.
            </p>
          </PolicySection>

          <PolicySection id="providers" number="04" title="Providers and international handling">
            <p>
              Auralis uses vetted service providers to operate this experience: Supabase for private application records and CV storage, Resend for internal operational notifications, Cloudflare Turnstile for abuse prevention, Vercel for website and serverless infrastructure, and TBC through its hosted payment portal for verification.
            </p>
            <p>
              TBC and its payment environment handle payment credentials. Auralis never receives or stores card details; it keeps only the minimum provider reference and verification state needed to confirm and cancel the authorization.
            </p>
            <p>
              Some providers may process information outside Georgia or your country. Where required, Auralis uses contractual and organizational safeguards intended to protect those transfers.
            </p>
          </PolicySection>

          <PolicySection id="retention" number="05" title="Retention and deletion">
            <p>
              Contractor application records and CVs are scheduled for deletion 180 days after the most recent activity in the application process. You may request earlier deletion by contacting Auralis at the address below.
            </p>
            <p>
              After deletion, Auralis may retain only an anonymous count by role, submission month, and deletion reason. Limited information may be retained longer where necessary to establish or defend legal claims, meet a legal obligation, or document a resolved security incident.
            </p>
          </PolicySection>

          <PolicySection id="rights" number="06" title="Your choices and rights">
            <p>
              Depending on the law that applies to you, you may ask to access, correct, delete, restrict, or object to the handling of your information, and may have a right to complain to a competent data protection authority.
            </p>
            <p>
              Send a request to <a href="mailto:auralis.careers@proton.me">auralis.careers@proton.me</a>. Auralis may need to verify your identity before acting on a request and will explain any lawful limitation that applies.
            </p>
          </PolicySection>
        </article>
      </div>

      <section className="privacy-delete-band" id="delete-application" aria-labelledby="delete-title">
        <div className="privacy-delete-intro">
          <span>Application records</span>
          <h2 id="delete-title">Request permanent deletion.</h2>
          <p>
            Email Auralis from the address used for your contractor application. We will verify the request before deleting records.
          </p>
        </div>

        <div className="privacy-delete-action">
          <a className="privacy-confirm-button" href="mailto:auralis.careers@proton.me?subject=Application%20deletion%20request">
            Email deletion request <Mail size={19} aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer className="privacy-footer">
        <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
        <p>Privacy policy / Effective 10 July 2026</p>
        <a href="mailto:auralis.careers@proton.me">auralis.careers@proton.me</a>
      </footer>
    </main>
  );
}
