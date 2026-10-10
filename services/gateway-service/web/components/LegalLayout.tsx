import type { ReactNode } from 'react';
import { PublicNavbar } from './PublicNavbar';
import { getStoredLocale, translations } from '../i18n';

export function LegalLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  const copy = translations[getStoredLocale()];

  return (
    <main className="legal-page">
      <PublicNavbar />
      <header className="legal-hero">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
        <small>{copy.effectiveDate}</small>
      </header>
      <article className="legal-content">{children}</article>
      <footer className="landing-footer">
        <span>{copy.brandTitle}</span>
        <span>{copy.footerTagline}</span>
      </footer>
    </main>
  );
}
