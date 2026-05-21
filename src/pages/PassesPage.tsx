export function PassesPage() {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <p className="eyebrow">Reports</p>
        <h2>Walk-In Reports</h2>
        <p className="muted">Use the new dedicated pages for bills, generated passes, and visit history.</p>
      </section>
      <section className="stats-grid three">
        <div className="panel stat-card">
          <strong>Bill Dashboard</strong>
          <span className="muted">Summary cards and detailed bill table</span>
        </div>
        <div className="panel stat-card">
          <strong>Generated Passes</strong>
          <span className="muted">Pending and paid pass follow-up</span>
        </div>
        <div className="panel stat-card">
          <strong>Visit History</strong>
          <span className="muted">Historical logs, timing, payment, and verification</span>
        </div>
      </section>
    </div>
  );
}
