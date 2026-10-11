import { getStoredLocale, setStoredLocale, translations, type Locale } from '../i18n';
import { useState } from 'react';

export function PublicNavbar() {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale());
  const copy = translations[locale];

  const toggleLocale = () => {
    const nextLocale: Locale = locale === 'tr' ? 'en' : 'tr';
    setStoredLocale(nextLocale);
    setLocale(nextLocale);
    window.location.reload();
  };

  return (
    <nav className="landing-nav public-nav" aria-label={copy.brandTitle}>
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
          style={{ minHeight: '34px', padding: '6px 11px', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}
          onClick={toggleLocale}
          aria-label={copy.language}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>{locale.toUpperCase()}</span>
        </button>
        <a className="button button-primary" href="/login">
          <span>{copy.signInNav}</span>
          <span>→</span>
        </a>
      </div>
    </nav>
  );
}
