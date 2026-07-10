export default function HiringFlowHeader({ label }) {
  return (
    <header className="verification-header">
      <a className="hiring-brand" href="/" data-no-barba>Auralis</a>
      <div className="verification-header-meta">
        <span>{label}</span>
        <span className="verification-header-divider" aria-hidden="true" />
        <span className="verification-header-count"><b>03</b> / 03</span>
      </div>
    </header>
  );
}
