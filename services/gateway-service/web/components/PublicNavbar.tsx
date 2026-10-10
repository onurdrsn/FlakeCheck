import { getStoredLocale, setStoredLocale, translations, type Locale } from '../i18n';
import { useState } from 'react';

export function PublicNavbar() {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale());
  const copy = translations[locale];

  const toggleLocale = () => {
    const nextLocale: Locale = locale === 'tr' ? 'en' : 'tr';
    setStoredLocale(nextLocale);
    setLocale(nextLocale);
    // Reload if needed or let local react state update
    window.location.reload();
  };

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
        <a href="/docs">{copy.docsNav}</a>
        <a href="/terms">{copy.termsNav}</a>
        <a href="/privacy">{copy.privacyNav}</a>
        <button
          type="button"
          className="button button-ghost"
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', fontWeight: 600 }}
          onClick={toggleLocale}
        >
          🌐 {locale.toUpperCase()}
        </button>
        <a className="button button-primary" href="/login">
          {copy.signInNav} <span>→</span>
        </a>
      </div>
    </nav>
  );
}
