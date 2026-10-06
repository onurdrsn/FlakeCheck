import type { ReactNode } from 'react';
import { PublicNavbar } from './PublicNavbar';

export function LegalLayout({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <main className="legal-page">
    <PublicNavbar />
    <header className="legal-hero">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{intro}</p>
      <small>Effective date: October 5, 2026 · Version 1.0</small>
    </header>
    <article className="legal-content">{children}</article>
    <footer className="landing-footer"><span>FlakeCheck</span><span>Repository-scoped. Evidence-first. Built for CI.</span></footer>
  </main>;
}
