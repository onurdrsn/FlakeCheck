import { PublicNavbar } from '../components/PublicNavbar';

export function LandingPage() {
  return <main className="landing">
    <PublicNavbar />
    <section className="landing-hero"><div className="hero-copy"><span className="eyebrow">CI reliability, made visible</span><h1>Find the failures that <em>aren't real.</em></h1><p>FlakeCheck turns noisy test runs into deterministic evidence, so your team can fix regressions, quarantine flaky tests, and ship with confidence.</p><div className="hero-actions"><a className="button button-primary" href="/login">Open your workspace <span>→</span></a><a className="text-link" href="#how-it-works">See how it works ↓</a></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>FC</span></div><i className="orbit-node node-one" /><i className="orbit-node node-two" /><i className="orbit-node node-three" /></div></section>
    <section className="landing-proof"><span>Built for teams that care about</span><strong>faster feedback</strong><strong>clearer evidence</strong><strong>calmer releases</strong></section>
    <section className="landing-section" id="how-it-works"><span className="eyebrow">How it works</span><h2>Make every red build explain itself.</h2><div className="feature-grid"><article><span className="feature-index">A</span><h3>Ingest every report</h3><p>Stream JUnit, Jest, Playwright, pytest, and Go test output without loading an entire report into memory.</p></article><article><span className="feature-index">B</span><h3>Classify with evidence</h3><p>Deterministic rules separate proven flakes, environment issues, infrastructure failures, and real regressions.</p></article><article><span className="feature-index">C</span><h3>Act at the source</h3><p>Quarantine noisy tests, graduate healthy ones, and export pipeline-ready artifacts from one workspace.</p></article></div></section>
    <footer className="landing-footer"><span>FlakeCheck</span><span>Repository-scoped. Evidence-first. Built for CI.</span></footer>
  </main>;
}
