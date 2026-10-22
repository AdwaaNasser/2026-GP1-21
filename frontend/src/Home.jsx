import SiteHeader from './SiteHeader.jsx';
import SiteFooter from './SiteFooter.jsx';

export default function Home() {
  return (
    <div className="marketing-page">
      <SiteHeader />

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="pill"><span className="pill-dot" /> People operations, made clearer</span>
            <h1>Bring your people and work <span>into focus.</span></h1>
            <p>
              Bayyinah brings HR professionals, managers, and employees together
              in one welcoming, organized space. Work better as a team and stay
              connected every step of the way.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="/setup">Set up your organization <span aria-hidden="true">→</span></a>
              <a className="button button-quiet" href="/login">I already have an account</a>
            </div>
            <div className="hero-trust">
              <span className="trust-check">✓</span>
              Role-aware access
              <span className="trust-separator">·</span>
              Simple employee onboarding
            </div>
          </div>

          <div className="hero-art" aria-label="Preview of an employee operations dashboard">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="preview-window">
              <div className="preview-topbar">
                <div className="preview-brand"><img className="preview-logo" src="/bayyinah-logo.png" alt="" /> Bayyinah</div>
                <div className="preview-avatar">HR</div>
              </div>
              <div className="preview-body">
                <div className="preview-sidebar">
                  <span className="side-active">Overview</span>
                  <span>Dashboards</span>
                  <span>People</span>
                  <span>Departments</span>
                  <span>Reports</span>
                </div>
                <div className="preview-main">
                  <div className="preview-heading">
                    <div><small>ILLUSTRATIVE WORKSPACE PREVIEW</small><strong>Your people overview</strong></div>
                    <span className="preview-action">+ Add employee</span>
                  </div>
                  <div className="preview-metrics">
                    <div><small>Total employees</small><strong>128</strong><i className="metric-line line-purple" /></div>
                    <div><small>Departments</small><strong>8</strong><i className="metric-line line-orange" /></div>
                    <div><small>Invitations</small><strong>12</strong><i className="metric-line line-green" /></div>
                  </div>
                  <div className="preview-table">
                    <div className="table-title">Recent employees <span>View all</span></div>
                    <div className="preview-person"><i className="person-dot dot-lilac" /><span><b>Amal Hassan</b><small>Engineering</small></span><em>Employee</em></div>
                    <div className="preview-person"><i className="person-dot dot-peach" /><span><b>Omar Khalid</b><small>Operations</small></span><em className="role-manager">Manager</em></div>
                    <div className="preview-person"><i className="person-dot dot-mint" /><span><b>Lina Faisal</b><small>People & Culture</small></span><em>Employee</em></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-card float-top"><span className="float-icon">✦</span><span><b>Role-based access</b><small>Relevant information for each role</small></span></div>
            <div className="floating-card float-bottom"><span className="float-check">✓</span><span><b>Employee invited</b><small>Secure account setup is ready</small></span></div>
          </div>
        </section>

        <section className="feature-strip" aria-label="Platform benefits">
          <article><span className="feature-icon feature-purple">◎</span><div><strong>Organized employee records</strong><p>Keep employee and department information together.</p></div></article>
          <article><span className="feature-icon feature-orange">↗</span><div><strong>Role-based workspaces</strong><p>Give HR, managers, and employees relevant access.</p></div></article>
          <article><span className="feature-icon feature-green">✳</span><div><strong>Guided onboarding</strong><p>Review imported records before sending invitations.</p></div></article>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
