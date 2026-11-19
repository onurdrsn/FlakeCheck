# FlakeCheck — Technical & Off-Page SEO Checklist

## 1. Completed Technical & Content SEO (In-Repo)

- [x] **Edge-SSR Public Pages:** `/`, `/guides`, `/guides/:slug`, `/compare/:slug`, `/changelog`, `/docs/api` render complete semantic HTML directly from the Cloudflare Worker (`services/gateway-service/src/seo/ssr.ts`) with zero JS required for indexing.
- [x] **Strict Metadata Bounds (Verified by Unit Tests):** Every indexable page has a unique `<title>` (≤ 60 chars), `<meta name="description">` (≤ 155 chars), and `<link rel="canonical">`.
- [x] **Structured Data (JSON-LD):**
  - `Organization` (with `alternateName: ["Flake Check", "flake-check"]`)
  - `WebSite`
  - `SoftwareApplication`
  - `FAQPage` (landing + guides)
  - `Article` & `BreadcrumbList` (all guides & comparison pages)
- [x] **Dynamic Open Graph & Twitter Cards:** `og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `twitter:card=summary_large_image`, backed by dynamic `/og/:slug.svg` generator.
- [x] **Discovery Files:** Auto-generated `/sitemap.xml`, `/robots.txt`, and `/llms.txt`.
- [x] **Index Hygiene:** Dashboard & auth SPA shell (`index.html`) sets `noindex, nofollow`; `/robots.txt` disallows `/app`, `/dashboard`, `/login`, `/api/` (while explicitly allowing `/api/v1/badge/` and `/api/v1/openapi.json`).
- [x] **Core Web Vitals & Edge Caching:** Zero render-blocking external CSS/JS on SSR pages, inline minimal CSS, `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`, trailing-slash `301` redirect, clean `404` page, skip-to-content link, single `<h1>`.
- [x] **Content Hub:** 9 technical guides (fundamentals, detection, remediation, Jest, Playwright, Pytest, Go, JUnit, GitHub Actions/GitLab CI) + 2 honest comparison pages (BuildPulse, Datadog CI Visibility) + `/changelog`.
- [x] **Discoverability Assets:** Optimized `packages/cli/package.json` (`keywords` + `description`), public SVG README badges with FlakeCheck brand attribution link.

---

## 2. Lighthouse Audit Targets & Verification Summary

Because Edge-SSR pages serve pure semantic HTML + inline critical CSS with zero third-party blocking scripts:
- **Performance:** Target **98–100** (LCP < 0.8s on Cloudflare edge, CLS = 0.00, INP < 50ms)
- **SEO:** Target **100** (validated `<title>`, `<meta description>`, canonical, robots, sitemap, JSON-LD, crawlable links)
- **Accessibility:** Target **98–100** (skip link, landmarks, contrast ≥ 4.5:1, single `<h1>`, `aria-label`s)
- **Best Practices:** Target **100** (HTTPS, CSP, HSTS, `X-Content-Type-Options`, zero console errors)

Run live verification after deploying to production:
```bash
npx lighthouse https://flakecheck.onurd.com.tr/ --only-categories=performance,seo,accessibility,best-practices --output=html --output-path=./lighthouse-report.html
npx lighthouse https://flakecheck.onurd.com.tr/guides/what-is-a-flaky-test --only-categories=performance,seo,accessibility,best-practices
```

---

## 3. Manual External Steps Required (Off-Page SEO & Launch)

These steps require external accounts and cannot be automated from Git:

1. **Google Search Console:**
   - Add domain property `flakecheck.onurd.com.tr` via Cloudflare DNS TXT record.
   - Submit `https://flakecheck.onurd.com.tr/sitemap.xml`.
   - Use URL Inspection on `/` and `/guides/what-is-a-flaky-test` to request immediate indexing.
2. **Bing Webmaster Tools:**
   - Import property from Google Search Console and submit `sitemap.xml` (also feeds DuckDuckGo & Copilot/ChatGPT search).
3. **Schema & Rich Results Validation:**
   - Test `/` and `/guides/what-is-a-flaky-test` in [Google Rich Results Test](https://search.google.com/test/rich-results) and [Schema.org Validator](https://validator.schema.org/).
4. **GitHub Repository Optimization:**
   - Set repo description: `FlakeCheck (Flake Check) — Open-source flaky test detector, root-cause classifier, and auto-quarantine platform for CI/CD (JUnit, CTRF, Jest, Vitest, Playwright, Pytest, Go).`
   - Add GitHub Topics: `flaky-tests`, `flaky-test-detection`, `ci-cd`, `github-actions`, `testing`, `playwright`, `jest`, `vitest`, `pytest`, `junit`, `ctrf`, `cloudflare-workers`, `hono`, `drizzle-orm`.
5. **Launch & Backlink Distribution:**
   - Publish launch post on **Hacker News (Show HN)**, **Product Hunt**, **dev.to**, **Hashnode**, and **r/devops**, **r/QualityAssurance**, **r/typescript**.
   - Publish `@onurdrsn/flakecheck` to npm (`pnpm --filter @onurdrsn/flakecheck publish`) so the updated `keywords` and `description` index on npmjs.com.
   - Submit PRs to `awesome-testing`, `awesome-ci`, `awesome-playwright`, and `awesome-cloudflare` lists.
   - Encourage open-source adopters to embed the FlakeCheck SVG health badge (`[![FlakeCheck Health](...)](https://flakecheck.onurd.com.tr/)`) in their READMEs for organic brand backlinks.
