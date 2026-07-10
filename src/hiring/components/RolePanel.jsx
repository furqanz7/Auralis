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

export default function RolePanel({ role = null }) {
  const isSelected = Boolean(role);
  const title = role?.title ?? "Choose your role.";
  const summary = role
    ? ROLE_COPY[role.slug]
    : "Auralis is hiring senior independent contractors across product, engineering, design, and delivery.";

  return (
    <section className="hiring-role-panel" aria-labelledby="hiring-role-title">
      <div className="hiring-role-content">
        <h2 id="hiring-role-title">{title}</h2>
        <span className="hiring-role-accent" aria-hidden="true" />
        <p className="hiring-role-meta">
          {isSelected ? role.engagement : "Independent contractor"}
          <i aria-hidden="true" />
          {isSelected ? role.location : "Remote worldwide"}
        </p>
        <p className="hiring-role-rate">
          {isSelected
            ? `${role.currency} ${role.rateMin}-${role.rateMax} / hour`
            : "Select an open role to view its rate"}
        </p>
        <p className="hiring-role-summary">{summary}</p>
      </div>
      <div className="hiring-role-art" aria-hidden="true">
        <img src="/assets/auralis-obsidian-hero.png" alt="" />
      </div>
    </section>
  );
}
