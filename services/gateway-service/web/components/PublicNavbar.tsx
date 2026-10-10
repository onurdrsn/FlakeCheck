import { getStoredLocale, translations } from '../i18n';

export function PublicNavbar() {
  const copy = translations[getStoredLocale()];

  return (
    <nav className="landing-nav public-nav">
      <a className="brand landing-brand" href="/">
        <span className="brand-mark">FC</span>
        <div>
          <strong>{copy.brandTitle}</strong>
          <small>{copy.brandTagline}</small>
        </div>
      </a>
      <div className="landing-links">
        <a href="/#how-it-works">{copy.howItWorks}</a>
        <a href="/terms">{copy.termsNav}</a>
        <a href="/privacy">{copy.privacyNav}</a>
        <a className="button button-primary" href="/login">
          {copy.signInNav} <span>→</span>
        </a>
      </div>
    </nav>
  );
}
