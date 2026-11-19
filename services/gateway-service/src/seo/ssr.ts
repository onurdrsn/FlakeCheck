import { Hono } from 'hono';
import { findSeoGuide, SEO_GUIDES, type SeoGuide } from './content.js';

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getBaseUrl(env: { PUBLIC_APP_URL?: string }, reqUrl: string): string {
  if (env.PUBLIC_APP_URL) return env.PUBLIC_APP_URL.replace(/\/+$/, '');
  const u = new URL(reqUrl);
  return `${u.protocol}//${u.host}`;
}

interface PageMeta {
  baseUrl: string;
  path: string;
  title: string;
  description: string;
  ogType?: 'website' | 'article';
  ogSlug: string;
  noindex?: boolean;
  jsonLd: Record<string, unknown>[];
  bodyHtml: string;
}

function renderShell(meta: PageMeta): string {
  const canonical = `${meta.baseUrl}${meta.path === '/' ? '/' : meta.path}`;
  const ogImage = `${meta.baseUrl}/og/${encodeURIComponent(meta.ogSlug)}.svg`;
  const robots = meta.noindex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large';
  const ldScripts = meta.jsonLd
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${esc(canonical)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#070a0f" />
    <meta property="og:type" content="${meta.ogType ?? 'website'}" />
    <meta property="og:site_name" content="FlakeCheck" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />
    ${ldScripts}
    <style>
      :root{--bg:#070a0f;--panel:#0e131d;--panel2:#131a27;--line:rgba(255,255,255,.09);--text:#f1f5f9;--muted:#94a3b8;--mint:#34d399;--mint2:#10b981;--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;--sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      *{box-sizing:border-box}
      body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.65;-webkit-font-smoothing:antialiased}
      a{color:var(--mint);text-decoration:none}
      a:hover{text-decoration:underline}
      .skip-link{position:absolute;left:-9999px;top:0;background:var(--mint);color:#04120c;padding:8px 14px;font-weight:700;z-index:100}
      .skip-link:focus{left:12px;top:12px;border-radius:6px}
      .nav{position:sticky;top:0;z-index:40;background:var(--bg);border-bottom:1px solid var(--line)}
      .nav-inner{max-width:1160px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:800;font-size:16px;letter-spacing:-.02em}
      .brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;border:1px solid var(--mint);background:rgba(16,185,129,.15);color:var(--mint);font:700 12px var(--mono)}
      .nav-links{display:flex;align-items:center;gap:18px;flex-wrap:wrap;font-size:14px}
      .nav-links a{color:var(--muted);font-weight:500}
      .nav-links a:hover{color:var(--text)}
      .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:9px;font-weight:600;font-size:14px;border:1px solid var(--line);background:var(--panel2);color:var(--text);transition:transform .15s,border-color .15s}
      .btn:hover{border-color:var(--mint);text-decoration:none;transform:translateY(-1px)}
      .btn-primary{background:linear-gradient(135deg,#34d399,#10b981);color:#052016;border-color:#34d399;font-weight:700}
      .wrap{max-width:1160px;margin:0 auto;padding:48px 24px}
      .article-wrap{max-width:860px;margin:0 auto;padding:44px 24px}
      h1{font-size:clamp(2rem,4vw,3.1rem);line-height:1.15;letter-spacing:-.03em;margin:0 0 18px;color:#fff}
      h2{font-size:clamp(1.35rem,2.4vw,1.8rem);line-height:1.25;letter-spacing:-.02em;margin:36px 0 12px;color:#fff}
      h3{font-size:1.05rem;margin:0 0 8px;color:#fff}
      p{color:var(--muted);margin:0 0 16px}
      .lead{font-size:1.12rem;color:#cbd5e1;max-width:70ch}
      .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font:600 12px var(--mono);color:var(--mint);background:rgba(16,185,129,.12);border:1px solid rgba(52,211,153,.3);margin-bottom:16px}
      .grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:24px}
      .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
      .card:hover{border-color:rgba(52,211,153,.35)}
      pre{background:#0b1018;border:1px solid var(--line);border-radius:10px;padding:16px;overflow-x:auto;font:13px/1.6 var(--mono);color:#e2e8f0;margin:18px 0}
      code{font-family:var(--mono);font-size:.9em}
      .breadcrumb{display:flex;gap:8px;font-size:13px;color:var(--muted);margin-bottom:18px;flex-wrap:wrap}
      .faq-item{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:12px}
      .footer{border-top:1px solid var(--line);margin-top:64px;padding:36px 24px;color:var(--muted);font-size:13px}
      .footer-inner{max-width:1160px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:24px}
      .footer ul{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px}
      .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
      @media (max-width:640px){.wrap,.article-wrap{padding:28px 16px}}
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="nav">
      <div class="nav-inner">
        <a class="brand" href="/"><span class="brand-mark">FC</span><span>FlakeCheck</span></a>
        <nav class="nav-links" aria-label="Primary navigation">
          <a href="/guides">Guides</a>
          <a href="/docs">Docs</a>
          <a href="/docs/api">API</a>
          <a href="/compare/flakecheck-vs-buildpulse">Compare</a>
          <a href="/changelog">Changelog</a>
          <a href="/status">Status</a>
          <a class="btn btn-primary" href="/login">Open Dashboard</a>
        </nav>
      </div>
    </header>
    <main id="main-content">
      ${meta.bodyHtml}
    </main>
    <footer class="footer">
      <div class="footer-inner">
        <div>
          <strong style="color:#fff">FlakeCheck</strong>
          <p style="margin-top:8px">Edge-native flaky test detection, root-cause forensics, and automated quarantine for modern CI/CD pipelines.</p>
        </div>
        <div>
          <strong style="color:#fff">Flaky Test Guides</strong>
          <ul>
            <li><a href="/guides/what-is-a-flaky-test">What is a flaky test?</a></li>
            <li><a href="/guides/how-to-detect-flaky-tests">How to detect flaky tests</a></li>
            <li><a href="/guides/how-to-fix-flaky-tests">How to fix flaky tests</a></li>
            <li><a href="/guides/github-actions-flaky-tests">GitHub Actions &amp; GitLab CI</a></li>
          </ul>
        </div>
        <div>
          <strong style="color:#fff">Frameworks &amp; Compare</strong>
          <ul>
            <li><a href="/guides/jest-flaky-tests">Jest Flaky Tests</a></li>
            <li><a href="/guides/playwright-flaky-tests">Playwright Flaky Tests</a></li>
            <li><a href="/guides/pytest-flaky-tests">Pytest Flaky Tests</a></li>
            <li><a href="/compare/flakecheck-vs-buildpulse">FlakeCheck vs BuildPulse</a></li>
            <li><a href="/compare/flakecheck-vs-datadog-ci">FlakeCheck vs Datadog CI</a></li>
          </ul>
        </div>
        <div>
          <strong style="color:#fff">Developers</strong>
          <ul>
            <li><a href="/docs">Documentation</a></li>
            <li><a href="/docs/api">OpenAPI 3.1 Reference</a></li>
            <li><a href="/changelog">Changelog</a></li>
            <li><a href="/sitemap.xml">Sitemap</a></li>
            <li><a href="/llms.txt">llms.txt</a></li>
            <li><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></li>
          </ul>
        </div>
      </div>
    </footer>
  </body>
</html>`;
}

export function renderDynamicOgSvg(title: string, subtitle: string): string {
  const safeTitle = esc(title.slice(0, 58));
  const safeSub = esc(subtitle.slice(0, 96));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070a0f"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="64" y="64" width="1072" height="502" rx="24" fill="#0e131d" stroke="rgba(52,211,153,0.35)" stroke-width="2"/>
  <rect x="112" y="116" width="58" height="58" rx="14" fill="rgba(16,185,129,0.18)" stroke="#34d399" stroke-width="2"/>
  <text x="141" y="153" text-anchor="middle" fill="#34d399" font-family="monospace" font-size="24" font-weight="700">FC</text>
  <text x="190" y="154" fill="#e2e8f0" font-family="sans-serif" font-size="28" font-weight="700">FlakeCheck</text>
  <text x="112" y="290" fill="#ffffff" font-family="sans-serif" font-size="46" font-weight="800">${safeTitle}</text>
  <text x="112" y="360" fill="#94a3b8" font-family="sans-serif" font-size="24">${safeSub}</text>
  <rect x="112" y="450" width="260" height="6" rx="3" fill="url(#accent)"/>
  <text x="112" y="505" fill="#34d399" font-family="monospace" font-size="20">flakecheck.onurd.com.tr · Flaky Test Detection &amp; Quarantine</text>
</svg>`;
}

function renderLandingBody(): string {
  return `
  <section class="wrap">
    <span class="pill">OPEN-SOURCE · EDGE-NATIVE FLAKY TEST DETECTOR</span>
    <h1>Detect, Classify &amp; Quarantine Flaky Tests Before They Break CI</h1>
    <p class="lead">FlakeCheck (Flake Check) is a statistical flaky test detection and auto-quarantine platform built for real CI pipelines. Stream JUnit XML, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, or Go reports — get Wilson confidence scores, 6-class root cause forensics, CI cost analytics, and non-blocking quarantine.</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="/login">Start Free in Dashboard</a>
      <a class="btn" href="/docs/api">Explore OpenAPI Docs</a>
      <a class="btn" href="/guides/how-to-detect-flaky-tests">Read Detection Guide</a>
    </div>
    <pre><code># Install &amp; stream test results in 30 seconds
npx @onurdrsn/flakecheck init --gateway https://flakecheck.onurd.com.tr --repo owner/repo --token $FLAKECHECK_TOKEN
npx @onurdrsn/flakecheck ingest ./junit.xml --format junit
npx @onurdrsn/flakecheck doctor --json</code></pre>
  </section>
  <section class="wrap" style="padding-top:0">
    <h2>Production Features Built for Engineering Teams</h2>
    <div class="grid-3">
      <div class="card"><h3>Statistical Flakiness Scoring</h3><p>Combines same-commit rerun flips and cross-run flip-rate history with Wilson 95% confidence intervals and minimum sample size guards.</p></div>
      <div class="card"><h3>6-Class Root Cause Forensics</h3><p>Automatically classifies timing/race, test order dependency, network/external, shared state, resource/concurrency, and environment diffs with fix guidance.</p></div>
      <div class="card"><h3>Auto-Quarantine &amp; Policy Engine</h3><p>Quarantine flaky tests in non-blocking CI mode with owner tracking, audit history, manual override, and automatic graduation after N clean passes.</p></div>
      <div class="card"><h3>Universal Format Adapters</h3><p>Native parsers for JUnit XML, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, and Go test JSON with resilient diagnostics.</p></div>
      <div class="card"><h3>CI Cost &amp; Waste Reporting</h3><p>Measure exact CI runner minutes and estimated USD burned by flaky retries, export CSV/JSON, and embed live README health badges.</p></div>
      <div class="card"><h3>GitHub, Jira, Linear &amp; Alerts</h3><p>Post GitHub PR comments and commit status checks, auto-open/close issues in GitHub/Jira/Linear, and route deduped Slack/Discord/Email alerts.</p></div>
    </div>
  </section>
  <section class="wrap" style="padding-top:0">
    <h2>Self-Host or Managed — Transparent Pricing</h2>
    <div class="grid-3">
      <div class="card"><h3>Open Source Self-Host — $0</h3><p>Deploy on your own Cloudflare Workers + Neon PostgreSQL free tier in under 5 minutes. Full MIT source code, zero seat limits.</p></div>
      <div class="card"><h3>Hosted Cloud — Free Beta</h3><p>Instant GitHub OAuth onboarding, automated quarantine cron, public/private SVG badges, and OpenAPI 3.1 access at flakecheck.onurd.com.tr.</p></div>
      <div class="card"><h3>Enterprise &amp; Multi-Tenant</h3><p>Organizations, RBAC (owner/admin/member/viewer), scoped API keys, audit logs, GDPR/KVKK data export &amp; erasure.</p></div>
    </div>
  </section>
  <section class="wrap" style="padding-top:0">
    <h2>Frequently Asked Questions</h2>
    <div class="faq-item"><h3>What is FlakeCheck?</h3><p>FlakeCheck (also known as Flake Check or flake-check) is an open-source flaky test detector that ingests CI test reports, computes statistical flakiness scores, diagnoses root causes, and quarantines unstable tests.</p></div>
    <div class="faq-item"><h3>Which test frameworks and CI systems are supported?</h3><p>FlakeCheck supports JUnit XML, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, and Go test JSON, with ready-to-use templates for GitHub Actions, GitLab CI, CircleCI, and Jenkins.</p></div>
    <div class="faq-item"><h3>Does FlakeCheck require an SDK inside my tests?</h3><p>No. FlakeCheck works out of the box with standard test report files via the CLI or authenticated CI webhooks.</p></div>
  </section>`;
}

function renderGuideBody(guide: SeoGuide): string {
  const sectionLabel = guide.section === 'guides' ? 'Guides' : 'Comparisons';
  const blocks = guide.sections
    .map(
      (s) => `
      <h2>${esc(s.heading)}</h2>
      ${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${s.code ? `<pre><code class="language-${esc(s.code.lang)}">${esc(s.code.snippet)}</code></pre>` : ''}`,
    )
    .join('');

  const faqHtml = guide.faqs?.length
    ? `<h2>Frequently Asked Questions</h2>${guide.faqs.map((f) => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('')}`
    : '';

  const related = SEO_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);
  const relatedHtml = `<h2>Related Guides</h2><div class="grid-3">${related
    .map((r) => `<a class="card" href="/${r.section}/${r.slug}"><h3>${esc(r.h1)}</h3><p>${esc(r.description)}</p></a>`)
    .join('')}</div>`;

  return `
  <article class="article-wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span>/</span>
      <a href="/guides">${sectionLabel}</a><span>/</span>
      <span>${esc(guide.category)}</span>
    </nav>
    <span class="pill">${esc(guide.category.toUpperCase())} · ${guide.readMinutes} MIN READ</span>
    <h1>${esc(guide.h1)}</h1>
    <p class="lead">${esc(guide.description)}</p>
    ${blocks}
    ${faqHtml}
    <div class="card" style="margin-top:32px">
      <h3>Eliminate flaky tests automatically with FlakeCheck</h3>
      <p>Stream your JUnit, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, or Go reports to FlakeCheck and get statistical scoring + auto-quarantine in minutes.</p>
      <div class="cta-row"><a class="btn btn-primary" href="/login">Launch FlakeCheck</a><a class="btn" href="/docs/api">API Docs</a></div>
    </div>
    ${relatedHtml}
  </article>`;
}

export function createSeoRouter() {
  const seo = new Hono<{ Bindings: { PUBLIC_APP_URL?: string } }>();

  const cacheHeaders = {
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  };

  // Trailing slash redirect (except root)
  seo.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
      return c.redirect(url.toString(), 301);
    }
    return next();
  });

  // Dynamic OG image SVG
  seo.get('/og/:slugSvg', (c) => {
    const slug = c.req.param('slugSvg').replace(/\.svg$/i, '');
    const guide = SEO_GUIDES.find((g) => g.slug === slug);
    const title = guide ? guide.h1 : 'FlakeCheck — Flaky Test Detector';
    const subtitle = guide ? guide.description : 'Statistical flakiness scoring, root-cause forensics, and auto-quarantine for CI/CD.';
    return new Response(renderDynamicOgSvg(title, subtitle), {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', ...cacheHeaders },
    });
  });

  // robots.txt
  seo.get('/robots.txt', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Allow: /guides/',
      'Allow: /compare/',
      'Allow: /docs',
      'Allow: /changelog',
      'Disallow: /app',
      'Disallow: /dashboard',
      'Disallow: /login',
      'Disallow: /api/',
      'Allow: /api/v1/badge/',
      'Allow: /api/v1/openapi.json',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
    ].join('\n');
    return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cacheHeaders } });
  });

  // sitemap.xml
  seo.get('/sitemap.xml', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const today = new Date().toISOString().slice(0, 10);
    const staticPaths = ['/', '/guides', '/docs', '/docs/api', '/changelog', '/status', '/support', '/privacy', '/terms'];
    const guideUrls = SEO_GUIDES.map((g) => ({ loc: `${baseUrl}/${g.section}/${g.slug}`, lastmod: g.updatedAt, priority: '0.8' }));
    const staticUrls = staticPaths.map((p) => ({ loc: `${baseUrl}${p}`, lastmod: today, priority: p === '/' ? '1.0' : '0.7' }));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...guideUrls]
  .map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', ...cacheHeaders } });
  });

  // llms.txt
  seo.get('/llms.txt', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const lines = [
      '# FlakeCheck',
      '',
      '> FlakeCheck (Flake Check / flake-check) is an open-source, edge-native flaky test detection, root-cause classification, and automated quarantine platform built on Hono, Cloudflare Workers, Drizzle ORM, and Neon PostgreSQL.',
      '',
      '## Core Capabilities',
      '- Statistical Flakiness Scoring: Wilson 95% confidence intervals combining same-commit rerun flips and cross-run flip-rate history.',
      '- Root Cause Classification: timing_race, order_dependency, network_external, shared_state, resource_concurrency, environment_diff, unknown.',
      '- Universal Test Report Adapters: JUnit XML, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, Go test JSON.',
      '- Auto-Quarantine & Policy Engine: score/flip/sample thresholds, non-blocking CI quarantine mode, manual overrides, auto-graduation.',
      '- Integrations: GitHub Actions, GitLab CI, CircleCI, Jenkins, GitHub PR comments & commit status checks, GitHub Issues, Jira, Linear, Slack, Discord, Email, signed webhooks.',
      '',
      '## Key URLs',
      `- Home: ${baseUrl}/`,
      `- OpenAPI 3.1 Schema: ${baseUrl}/api/v1/openapi.json`,
      `- Interactive API Docs: ${baseUrl}/docs/api`,
      `- Guides Hub: ${baseUrl}/guides`,
      `- Changelog: ${baseUrl}/changelog`,
      ...SEO_GUIDES.map((g) => `- ${g.h1}: ${baseUrl}/${g.section}/${g.slug}`),
    ];
    return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cacheHeaders } });
  });

  // SSR Landing Page (for crawlers & fast first paint; interactive dashboard lives at /app & /login)
  seo.get('/', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const html = renderShell({
      baseUrl,
      path: '/',
      title: 'FlakeCheck — Flaky Test Detection & Auto-Quarantine',
      description: 'Detect flaky tests, classify root causes, measure CI waste, and auto-quarantine unstable tests with FlakeCheck across Jest, Playwright, Pytest & JUnit.',
      ogSlug: 'home',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'FlakeCheck',
          alternateName: ['Flake Check', 'flake-check'],
          url: baseUrl,
          logo: `${baseUrl}/favicon.svg`,
          sameAs: ['https://github.com/onurdrsn/FlakeCheck'],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'FlakeCheck',
          url: baseUrl,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'FlakeCheck',
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Linux, macOS, Windows, Web',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          description: 'Open-source flaky test detector with Wilson CI scoring, 6-class root-cause classification, and automated CI quarantine.',
          url: baseUrl,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: 'What is FlakeCheck?',
              acceptedAnswer: { '@type': 'Answer', text: 'FlakeCheck is an open-source flaky test detector that ingests CI test reports, computes statistical flakiness scores, diagnoses root causes, and quarantines unstable tests.' },
            },
            {
              '@type': 'Question',
              name: 'Which test frameworks are supported?',
              acceptedAnswer: { '@type': 'Answer', text: 'JUnit XML, CTRF, Jest, Vitest, Playwright, Pytest, Mocha, and Go test JSON.' },
            },
          ],
        },
      ],
      bodyHtml: renderLandingBody(),
    });
    return c.html(html, 200, cacheHeaders);
  });

  // Guides Hub
  seo.get('/guides', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const cards = SEO_GUIDES.map(
      (g) => `<a class="card" href="/${g.section}/${g.slug}"><span class="pill">${esc(g.category)}</span><h3>${esc(g.h1)}</h3><p>${esc(g.description)}</p></a>`,
    ).join('');
    const html = renderShell({
      baseUrl,
      path: '/guides',
      title: 'Flaky Test Guides & Comparisons | FlakeCheck',
      description: 'In-depth engineering guides on detecting, classifying, fixing, and quarantining flaky tests across Jest, Playwright, Pytest, Go, and GitHub Actions.',
      ogSlug: 'guides',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
            { '@type': 'ListItem', position: 2, name: 'Guides', item: `${baseUrl}/guides` },
          ],
        },
      ],
      bodyHtml: `<section class="wrap"><span class="pill">ENGINEERING PLAYBOOK</span><h1>Flaky Test Guides &amp; Framework Playbooks</h1><p class="lead">Practical guides written by CI reliability engineers to detect, root-cause, and fix flaky tests in production.</p><div class="grid-3">${cards}</div></section>`,
    });
    return c.html(html, 200, cacheHeaders);
  });

  // Individual Guide & Compare Articles
  for (const section of ['guides', 'compare'] as const) {
    seo.get(`/${section}/:slug`, (c) => {
      const slug = c.req.param('slug');
      const guide = findSeoGuide(section, slug);
      const baseUrl = getBaseUrl(c.env, c.req.url);
      if (!guide) {
        return c.html(
          renderShell({
            baseUrl,
            path: `/${section}/${slug}`,
            title: 'Page Not Found | FlakeCheck',
            description: 'The requested FlakeCheck guide could not be found.',
            ogSlug: '404',
            noindex: true,
            jsonLd: [],
            bodyHtml: `<section class="article-wrap"><h1>404 — Guide Not Found</h1><p>We could not find that article. Browse all flaky test guides below.</p><a class="btn btn-primary" href="/guides">View All Guides</a></section>`,
          }),
          404,
        );
      }

      const jsonLd: Record<string, unknown>[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guide.h1,
          description: guide.description,
          datePublished: guide.publishedAt,
          dateModified: guide.updatedAt,
          author: { '@type': 'Organization', name: 'FlakeCheck' },
          publisher: { '@type': 'Organization', name: 'FlakeCheck', logo: { '@type': 'ImageObject', url: `${baseUrl}/favicon.svg` } },
          mainEntityOfPage: `${baseUrl}/${section}/${guide.slug}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
            { '@type': 'ListItem', position: 2, name: section === 'guides' ? 'Guides' : 'Compare', item: `${baseUrl}/guides` },
            { '@type': 'ListItem', position: 3, name: guide.h1, item: `${baseUrl}/${section}/${guide.slug}` },
          ],
        },
      ];
      if (guide.faqs?.length) {
        jsonLd.push({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: guide.faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        });
      }

      return c.html(
        renderShell({
          baseUrl,
          path: `/${section}/${guide.slug}`,
          title: guide.title,
          description: guide.description,
          ogType: 'article',
          ogSlug: guide.slug,
          jsonLd,
          bodyHtml: renderGuideBody(guide),
        }),
        200,
        cacheHeaders,
      );
    });
  }

  // Changelog Page
  seo.get('/changelog', (c) => {
    const baseUrl = getBaseUrl(c.env, c.req.url);
    const html = renderShell({
      baseUrl,
      path: '/changelog',
      title: 'FlakeCheck Changelog — Production Releases',
      description: 'Release notes for FlakeCheck: statistical flakiness scoring, root-cause forensics, CTRF/Vitest/Mocha adapters, auto-quarantine, and OpenAPI 3.1.',
      ogSlug: 'changelog',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
            { '@type': 'ListItem', position: 2, name: 'Changelog', item: `${baseUrl}/changelog` },
          ],
        },
      ],
      bodyHtml: `<article class="article-wrap">
        <span class="pill">CHANGELOG</span>
        <h1>FlakeCheck Release Changelog</h1>
        <p class="lead">Track production upgrades across our flaky test scoring engine, CI integrations, and public REST API.</p>
        <div class="card" style="margin-top:24px">
          <h2>v1.0.0 — Production Platform &amp; Edge SEO Release</h2>
          <p><strong>Statistical Flakiness Engine:</strong> Wilson 95% confidence intervals, rerun + history flip-rate scoring (0–100), and minimum sample size guards.</p>
          <p><strong>6-Class Root Cause Classifier:</strong> Automatic detection of timing/race, order dependency, network/external, shared state, resource/concurrency, and environment diff issues.</p>
          <p><strong>Adapters &amp; Integrations:</strong> Added CTRF, Vitest JSON, Mocha JSON parsers, GitHub/GitLab/CircleCI/Jenkins templates, PR comments, commit status checks, and GitHub/Jira/Linear issue sync.</p>
          <p><strong>Security &amp; Multi-Tenancy:</strong> Organizations, RBAC, scoped API keys, audit logs, Zod validation, rate limiting, CSP/HSTS headers, and GDPR/KVKK export.</p>
        </div>
      </article>`,
    });
    return c.html(html, 200, cacheHeaders);
  });

  return seo;
}
