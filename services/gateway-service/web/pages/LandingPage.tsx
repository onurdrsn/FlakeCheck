import { PublicNavbar } from '../components/PublicNavbar';
import { getStoredLocale, translations } from '../i18n';

export function LandingPage() {
  const copy = translations[getStoredLocale()];

  return (
    <main className="landing">
      <PublicNavbar />

      {/* HERO BANNER: Safe-zone focal composition + Live CI Telemetry Preview */}
      <section className="landing-hero">
        <div className="hero-copy">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', marginBottom: '8px' }}>
            <span className="status-dot" style={{ marginRight: 0 }} />
            <span className="eyebrow" style={{ color: 'var(--mint)' }}>{copy.landingHeroEyebrow}</span>
          </div>
          <h1>{copy.landingHeroTitle}</h1>
          <p>{copy.landingHeroDesc}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="/login" style={{ padding: '12px 20px', fontSize: '13.5px' }}>
              <span>{copy.openWorkspace}</span>
              <span>→</span>
            </a>
            <a className="button button-ghost" href="/docs" style={{ padding: '12px 18px', fontSize: '13.5px' }}>
              <span>{copy.docsNav}</span>
              <span>↗</span>
            </a>
            <a className="text-link" href="#how-it-works">
              {copy.seeHowItWorks} ↓
            </a>
          </div>

          {/* Supported Frameworks Strip */}
          <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid var(--line-subtle)' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>
              {copy.landingFrameworksLabel}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['JUnit XML', 'Jest / Vitest', 'Playwright E2E', 'Python pytest', 'Go test'].map((fw) => (
                <span
                  key={fw}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    font: '500 11px var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {fw}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Live Classification Matrix Card */}
        <div className="hero-preview-card" aria-label={copy.landingLivePreviewTitle}>
          <div className="hero-preview-bar">
            <div className="hero-preview-dots">
              <i />
              <i />
              <i />
            </div>
            <span>flakecheck analyze --repo acme/checkout</span>
            <span style={{ color: 'var(--mint)' }}>● 98% HEALTH</span>
          </div>
          <div className="hero-preview-body">
            <div
              style={{
                background: 'var(--fc-slate-950)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                font: '11px var(--font-mono)',
                color: 'var(--text-secondary)',
                lineHeight: 1.65,
              }}
            >
              <div style={{ color: 'var(--muted)' }}>$ npx @flakecheck/cli ingest &quot;reports/*.xml&quot; --analyze</div>
              <div style={{ color: 'var(--mint)' }}>✔ Ingested 5 test files (142 attempts) into single run</div>
              <div style={{ color: 'var(--blue)' }}>✔ Classified 2 intermittent flakes · 140 deterministic passes</div>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              {[
                {
                  name: 'checkout retries webhook on 502 timeout',
                  file: 'tests/e2e/checkout.spec.ts',
                  category: 'INTERMITTENT FLAKE',
                  confidence: '94%',
                  color: 'var(--amber)',
                },
                {
                  name: 'redis session lock contention under load',
                  file: 'tests/integration/session.test.ts',
                  category: 'ENVIRONMENT SENSITIVE',
                  confidence: '89%',
                  color: 'var(--blue)',
                },
                {
                  name: 'calculates multi-currency VAT breakdown',
                  file: 'tests/unit/pricing.spec.ts',
                  category: 'DETERMINISTIC PASS',
                  confidence: '100%',
                  color: 'var(--mint)',
                },
              ].map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '11px 13px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--line-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <strong style={{ fontSize: '12px', color: 'var(--fc-slate-50)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </strong>
                    </div>
                    <small style={{ display: 'block', font: '10.5px var(--font-mono)', color: 'var(--muted)', marginTop: '3px', paddingLeft: '15px' }}>
                      {item.file}
                    </small>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        font: '600 9.5px var(--font-mono)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: 'var(--panel-elevated)',
                        color: item.color,
                        border: '1px solid var(--line)',
                      }}
                    >
                      {item.category}
                    </span>
                    <div style={{ font: '700 11px var(--font-mono)', color: 'var(--fc-slate-100)', marginTop: '3px' }}>
                      {item.confidence}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TRUST & PROOF STRIP */}
      <section className="landing-proof">
        <span>{copy.landingProofLead}</span>
        <strong>
          <span style={{ color: 'var(--mint)' }}>✓</span> {copy.landingProof1}
        </strong>
        <strong>
          <span style={{ color: 'var(--mint)' }}>✓</span> {copy.landingProof2}
        </strong>
        <strong>
          <span style={{ color: 'var(--mint)' }}>✓</span> {copy.landingProof3}
        </strong>
      </section>

      {/* DUARTE SPARKLINE COMPARISON: BEFORE vs. WITH FLAKECHECK (slides skill) */}
      <section className="landing-section" style={{ paddingBottom: '20px' }}>
        <span className="eyebrow">{copy.landingCompareEyebrow}</span>
        <h2>{copy.landingCompareTitle}</h2>
        <div className="compare-grid">
          <div className="compare-card">
            <span className="eyebrow" style={{ color: 'var(--red)' }}>✕ {copy.landingBeforeTitle}</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'grid', gap: '14px' }}>
              {[copy.landingBefore1, copy.landingBefore2, copy.landingBefore3].map((point) => (
                <li key={point} style={{ display: 'flex', gap: '10px', fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="compare-card after">
            <span className="eyebrow" style={{ color: 'var(--mint)' }}>✓ {copy.landingAfterTitle}</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'grid', gap: '14px' }}>
              {[copy.landingAfter1, copy.landingAfter2, copy.landingAfter3].map((point) => (
                <li key={point} style={{ display: 'flex', gap: '10px', fontSize: '13.5px', color: 'var(--fc-slate-100)', lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--mint)', fontWeight: 700 }}>✓</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: 3-PILLAR ARCHITECTURE */}
      <section className="landing-section" id="how-it-works">
        <span className="eyebrow">{copy.howItWorks}</span>
        <h2>{copy.landingWorksTitle}</h2>
        <div className="feature-grid">
          <article>
            <span className="feature-index">01 · INGEST</span>
            <h3>{copy.feature1Title}</h3>
            <p>{copy.feature1Desc}</p>
          </article>
          <article>
            <span className="feature-index">02 · CLASSIFY</span>
            <h3>{copy.feature2Title}</h3>
            <p>{copy.feature2Desc}</p>
          </article>
          <article>
            <span className="feature-index">03 · QUARANTINE</span>
            <h3>{copy.feature3Title}</h3>
            <p>{copy.feature3Desc}</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="brand-mark" style={{ width: '26px', height: '26px', fontSize: '10px' }}>FC</span>
          <span>{copy.footerTagline}</span>
        </div>
        <div style={{ display: 'flex', gap: '18px' }}>
          <a className="text-link" href="/docs">{copy.docsNav}</a>
          <a className="text-link" href="/terms">{copy.termsNav}</a>
          <a className="text-link" href="/privacy">{copy.privacyNav}</a>
          <a className="text-link" href="/login">{copy.signInNav}</a>
        </div>
      </footer>
    </main>
  );
}
