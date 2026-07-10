import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Mail,
  Sparkles
} from "lucide-react";
import { useMemo, useState } from "react";
import PointerSystem from "./PointerSystem.jsx";
import {
  capabilities,
  contactLinks,
  navItems,
  projects,
  services,
  workflow
} from "./content.js";

const ease = [0.16, 1, 0.3, 1];

function Reveal({ children, className = "", delay = 0, as = "div", ...props }) {
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.74, ease, delay }}
      {...props}
    >
      {children}
    </Component>
  );
}

function BrandLockup({ compact = false }) {
  return (
    <a
      className={`brand-lockup${compact ? " compact" : ""}`}
      href="/"
      aria-label="Auralis home"
      data-cursor-label="Home"
    >
      <span>Auralis</span>
    </a>
  );
}

function SiteNav() {
  return (
    <header className="site-nav" aria-label="Primary navigation">
      <BrandLockup />
      <nav className="nav-links" aria-label="Site">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} data-cursor-label={item.label}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="nav-contact" href="#contact" data-cursor-label="Start">
        Start a project
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero-section" id="studio">
      <div className="hero-media" aria-hidden="true">
        <img src="/assets/auralis-hero-horizon.png" alt="" />
        <span className="hero-media-grid" />
      </div>
      <div className="hero-shade" aria-hidden="true" />
      <div className="hero-grid section-wrap">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.92, ease }}
        >
          <h1>
            <span>Digital products</span>
            <span>with an atmospheric edge.</span>
          </h1>
          <p>
            Auralis designs and builds AI-native platforms, cinematic websites,
            and resilient product systems for teams moving into their next orbit.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#contact" data-cursor-label="Start">
              Start a project
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="secondary-cta" href="#work" data-cursor-label="Work">
              View work
              <ArrowDownRight size={18} aria-hidden="true" />
            </a>
          </div>
        </motion.div>
        <motion.div
          className="hero-coordinates"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease, delay: 0.45 }}
        >
          <span>FIELD / 43.10 N</span>
          <i />
          <b>X 862.41</b>
          <b>Y 246.78</b>
        </motion.div>
      </div>
      <div className="hero-next section-wrap" aria-hidden="true">
        <span>01 / Services</span>
        <i />
      </div>
    </section>
  );
}

function ServicesSection() {
  const [active, setActive] = useState(services[0]);
  const activeIndex = useMemo(
    () => services.findIndex((service) => service.key === active.key),
    [active]
  );

  return (
    <section className="services-section section-wrap" id="services">
      <Reveal className="section-heading">
        <div>
          <h2>Focused expertise. Considered outcomes.</h2>
        </div>
        <p>
          We partner with founders and product leaders to turn complex ideas
          into beautiful, intelligent, and enduring digital products.
        </p>
      </Reveal>
      <div className="service-stage">
        <Reveal className="service-tabs" delay={0.08}>
          {services.map((service, index) => {
            const Icon = service.icon;
            const selected = service.key === active.key;

            return (
              <button
                key={service.key}
                type="button"
                className={selected ? "selected" : ""}
                style={{ "--accent": service.accent }}
                onClick={() => setActive(service)}
                data-cursor-label="Open"
                aria-pressed={selected}
              >
                <span className="service-number">0{index + 1}</span>
                <Icon size={19} aria-hidden="true" />
                <span>{service.title}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            );
          })}
        </Reveal>
        <Reveal className="service-detail" delay={0.16}>
          <motion.div
            key={active.key}
            style={{ "--accent": active.accent }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease }}
          >
            <span className="service-index">0{activeIndex + 1}</span>
            <Sparkles className="service-spark" size={20} aria-hidden="true" />
            <h3>{active.title}</h3>
            <p>{active.summary}</p>
            <ul>
              {active.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className="workflow-section section-wrap">
      <Reveal className="section-heading compact">
        <div>
          <span className="section-index">02 / Working rhythm</span>
          <h2>Sense. Shape. Ship.</h2>
        </div>
        <p>
          Auralis keeps discovery, design, engineering, and launch quality in a
          single loop so momentum does not leak between teams.
        </p>
      </Reveal>
      <div className="workflow-line">
        {workflow.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal
              key={item.title}
              as="article"
              className="workflow-item"
              delay={index * 0.08}
            >
              <span className="workflow-step">{item.step}</span>
              <span className="workflow-icon">
                <Icon size={23} aria-hidden="true" />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function CapabilityRail() {
  return (
    <section className="capability-rail section-wrap" aria-label="Auralis capabilities">
      {capabilities.map((item, index) => {
        const Icon = item.icon;
        return (
          <Reveal
            key={item.label}
            as="span"
            className="capability-item"
            delay={index * 0.035}
          >
            <Icon size={17} aria-hidden="true" />
            {item.label}
          </Reveal>
        );
      })}
    </section>
  );
}

function ProjectVisual({ project, index }) {
  return (
    <div className={`project-visual visual-${index + 1}`} aria-hidden="true">
      <img src={project.image} alt="" />
      <span className="project-count">0{index + 1}</span>
      <span className="project-line project-line-top" />
      <span className="project-line project-line-bottom" />
    </div>
  );
}

function WorkSection() {
  return (
    <section className="work-section" id="work">
      <div className="section-wrap">
        <Reveal className="section-heading">
          <div>
            <span className="section-index">03 / Selected work</span>
            <h2>Proof in the wild.</h2>
          </div>
          <p>
            Three recent orbits: data-heavy products, operational software, and
            sensitive workflows made calm enough to use every day.
          </p>
        </Reveal>
        <div className="project-grid">
          {projects.map((project, index) => (
            <Reveal
              key={project.name}
              as="article"
              className={`project-card project-card-${index + 1}`}
              delay={index * 0.07}
              style={{ "--accent": project.accent }}
            >
              <ProjectVisual project={project} index={index} />
              <div className="project-copy">
                <span className="project-index">Case / 0{index + 1}</span>
                <span>{project.type}</span>
                <h3>{project.name}</h3>
                <p>{project.body}</p>
                <a href="#contact" data-cursor-label="Open">
                  View project
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="contact-section" id="contact">
      <div className="contact-bg" aria-hidden="true">
        <img src="/assets/auralis-hero-horizon.png" alt="" />
      </div>
      <div className="section-wrap contact-grid">
        <Reveal className="contact-copy">
          <span className="section-index">04 / Contact</span>
          <h2>
            Bring us the <span>strange, ambitious</span> brief.
          </h2>
          <p>
            We typically reply within one business day with a clear next step,
            whether the answer is a sprint, prototype, or full product build.
          </p>
        </Reveal>
        <Reveal className="contact-panel" delay={0.12}>
          <a className="mail-link" href={contactLinks[0].href} data-cursor-label="Email">
            <Mail size={20} aria-hidden="true" />
            <span>{contactLinks[0].label}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <a className="deck-link" href={contactLinks[1].href} data-cursor-label="Deck">
            Studio deck
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer section-wrap">
      <BrandLockup compact />
      <div>
        {navItems.map((item) => (
          <a key={item.href} href={item.href} data-cursor-label={item.label}>
            {item.label}
          </a>
        ))}
      </div>
    </footer>
  );
}

export function HomePage() {
  return (
    <div className="site-page">
      <PointerSystem />
      <SiteNav />
      <Hero />
      <ServicesSection />
      <WorkflowSection />
      <CapabilityRail />
      <WorkSection />
      <ContactSection />
      <Footer />
    </div>
  );
}

export default function App() {
  return <HomePage />;
}
