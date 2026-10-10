import { PublicNavbar } from '../components/PublicNavbar';
import { getStoredLocale, translations } from '../i18n';

export function LandingPage() {
  const copy = translations[getStoredLocale()];

  return (
    <main className="landing">
      <PublicNavbar />
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">{copy.landingHeroEyebrow}</span>
          <h1>{copy.landingHeroTitle}</h1>
          <p>{copy.landingHeroDesc}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="/login">
              {copy.openWorkspace} <span>→</span>
            </a>
            <a className="text-link" href="#how-it-works">
              {copy.seeHowItWorks} ↓
            </a>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-core">
            <span>FC</span>
          </div>
          <i className="orbit-node node-one" />
          <i className="orbit-node node-two" />
          <i className="orbit-node node-three" />
        </div>
      </section>
      <section className="landing-proof">
        <span>{copy.landingProofLead}</span>
        <strong>{copy.landingProof1}</strong>
        <strong>{copy.landingProof2}</strong>
        <strong>{copy.landingProof3}</strong>
      </section>
      <section className="landing-section" id="how-it-works">
        <span className="eyebrow">{copy.howItWorks}</span>
        <h2>{copy.landingWorksTitle}</h2>
        <div className="feature-grid">
          <article>
            <span className="feature-index">A</span>
            <h3>{copy.feature1Title}</h3>
            <p>{copy.feature1Desc}</p>
          </article>
          <article>
            <span className="feature-index">B</span>
            <h3>{copy.feature2Title}</h3>
            <p>{copy.feature2Desc}</p>
          </article>
          <article>
            <span className="feature-index">C</span>
            <h3>{copy.feature3Title}</h3>
            <p>{copy.feature3Desc}</p>
          </article>
        </div>
      </section>
      <footer className="landing-footer">
        <span>{copy.brandTitle}</span>
        <span>{copy.footerTagline}</span>
      </footer>
    </main>
  );
}
