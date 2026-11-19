# FlakeCheck — Production Readiness & SEO Gap Analysis

**Generated:** 2026-11-19  
**Scope:** Monorepo (`packages/shared-kernel`, `packages/cli`, `services/ingestion-service`, `services/analysis-service`, `services/quarantine-service`, `services/gateway-service`)  
**Stack:** pnpm, Drizzle ORM + Neon PostgreSQL, Hono + Cloudflare Workers, React + Vite

---

## Executive Summary

FlakeCheck already has a solid multi-worker architecture (Gateway, Ingestion, Analysis, Quarantine), Drizzle + Neon PostgreSQL schema with 5 migrations (`0000`–`0004`), an HTTP-only CLI (`@onurdrsn/flakecheck`), and a React/Vite dashboard. However, to operate as a **production-grade multi-tenant SaaS/self-host platform** and rank organically for **flaky test** search queries, there are clear gaps across all 10 production areas and technical/content SEO.

---

## Section A: 10 Production Features — Current State vs. Gaps

| # | Area | What Exists Today | Production Gaps to Close |
|---|------|-------------------|--------------------------|
| **1** | **Statistical Flakiness Scoring Engine** | `services/analysis-service/src/classifier.ts` has rule-based classification (`PROVEN_FLAKE`, `SUSPECTED_FLAKE`, etc.) and basic transition flip rate (`>= 0.15`). | Missing: 0–100 composite flakiness score, Wilson score confidence interval, explicit combination of rerun-based + history-based flip signals, configurable thresholds & minimum sample size guard (`minSamples`) to prevent false positives, DB persistence of score/CI metrics. |
| **2** | **Root Cause Classification** | Basic regex check for infrastructure errors (`ECONNREFUSED`, `SIGKILL`, `DISK FULL`). | Missing: Dedicated root-cause engine covering all 6 required classes (`timing_race`, `order_dependency`, `network_external`, `shared_state`, `resource_concurrency`, `environment_diff`) + explicit `unknown` fallback, strict rule sets, matched log/stack evidence snippets, and actionable fix recommendations. |
| **3** | **CI Integrations** | CLI can stream reports; basic `/api/webhooks/github-marketplace` stub. | Missing: Ready-to-use templates for GitHub Actions (official composite Action), GitLab CI, CircleCI, and Jenkins; GitHub PR comment & Commit Status Check integration; authenticated CI webhook ingestion endpoint with HMAC signature verification. |
| **4** | **Test Framework Adapters & Standard Formats** | Parsers for JUnit XML, Jest JSON, Playwright JSON, Pytest JSON, Go test JSON. | Missing: **CTRF** (Common Test Report Format), **Vitest JSON**, and **Mocha JSON** adapters; hardened error handling with structured parse diagnostics for malformed/incomplete reports; CLI `--format` support for all new formats. |
| **5** | **Auto-Quarantine & Policy Engine** | Manual `setQuarantine`, basic `graduation.ts` & `skiplist.ts`. | Missing: Configurable policy engine (flakiness score threshold, rerun/flip count, auto-quarantine & auto-graduate), quarantine audit history table (`quarantine_history` with owner, actor, reason, mode), non-blocking CI "quarantine mode" flag, and manual override protection. |
| **6** | **Notifications & Alerting** | Simple `dispatchWebhook` for Slack/Discord without dedup or preferences. | Missing: Email (Resend) & generic signed webhook channels; noise control (deduplication window, rate limiting, daily/weekly digest builder); project/user notification preference storage & API. |
| **7** | **Auth, Multi-Tenancy & Security** | OTP email auth, GitHub/Google OAuth, `project_tokens` (SHA-256 hashed), `repository_access`. | Missing: Organizations & Projects schema, RBAC (`owner`, `admin`, `member`, `viewer`), API key scopes & rotation, persistent `audit_logs` table, request rate limiting middleware, Zod input validation on API routes, strict security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). |
| **8** | **Analytics Dashboard & Cost Reporting** | KPI strip, waste seconds/USD calculation, JSON/CSV export, basic timeline. | Missing: Top-10 flakiest tests & trend series endpoint, team/repo breakdown analytics, public/private SVG **README badge endpoint** (`/api/badge/:owner/:repo.svg` with brand link) and embeddable markdown snippet. |
| **9** | **Issue Tracker Integration & Public API** | Basic `/api/*` routes; CLI has `init`, `ingest`, `flakes`, `report`, `quarantine`, `server`. | Missing: GitHub Issues, Jira, and Linear auto-open/auto-close issue sync service; versioned `/api/v1/*` REST API; OpenAPI 3.1 schema (`/api/v1/openapi.json`) + interactive Swagger/Scalar docs under `/docs/api`; CLI `doctor` command & universal `--json` output flag. |
| **10** | **Reliability, Observability & DevOps** | `/health` endpoint checking worker bindings & Neon DB. | Missing: Structured JSON logger with secret redaction, `/ready` readiness probe, Neon retry/timeout helper, idempotent ingest (`Idempotency-Key` / deterministic run upsert), Cloudflare Queues binding + async consumer config, retention cleanup policy, GDPR/KVKK data export & erasure verification, staging/production Wrangler envs, CI pipeline workflow, `docs/DEPLOYMENT.md`. |

---

## Section B: Technical & Content SEO — Current State vs. Gaps

| Area | What Exists Today | SEO Gaps to Close |
|------|-------------------|-------------------|
| **Crawlability & SSR** | Pure client-side React SPA (`index.html`) — search bots see an empty `<div id="root"></div>`. | Need server-rendered HTML (SSR/edge-rendered via Hono Worker) for marketing, guide, comparison, docs, and changelog pages, with `noindex, nofollow` on `/app`, `/dashboard`, `/login`. |
| **Metadata & Schema** | Single static `<title>` and OG tags in `index.html`; `og-image.png` missing. | Unique `<title>` (<60 chars), `<meta description>` (<155 chars), canonical URL, OG + Twitter Card per route, dynamic SVG/PNG OG image generator (`/og/:slug.svg`), JSON-LD (`SoftwareApplication`, `Organization`, `WebSite`, `FAQPage`, `BreadcrumbList`, `Article`). |
| **Discovery Files** | None (`sitemap.xml`, `robots.txt`, `llms.txt` missing). | Auto-generated `/sitemap.xml`, `/robots.txt`, `/llms.txt` served by the Gateway Worker with proper cache headers. |
| **Content Hub** | Basic `LandingPage.tsx` and `DocsPage.tsx`. | Need 1000+ word original, code-rich guides: *What is a flaky test?*, *How to detect flaky tests*, *How to fix flaky tests*, Framework guides (Jest, Playwright, Pytest, Go, JUnit), CI guides (GitHub Actions, GitLab CI), honest comparison pages, and `/changelog`. |
| **Core Web Vitals & a11y** | Google Fonts blocking render; SPA hydration overhead; no static cache headers. | Semantic HTML, single `<h1>`, skip-to-content link, `font-display: swap`, Cloudflare `Cache-Control` headers on public pages & assets, clean 404 page & trailing-slash redirects. |
| **Package & Repo Metadata** | Minimal `packages/cli/package.json` description, no `keywords`. | Optimize `README.md`, `packages/cli/package.json` (`keywords`, `description`), and document GitHub topics + external launch steps in `docs/SEO_CHECKLIST.md`. |

---

## Pre-Existing Baseline Issues Fixed First
- Fixed 5 `exactOptionalPropertyTypes` TypeScript errors in `services/gateway-service/web/` (`toast.ts`, `OtpInput.tsx`, `WorkspaceConnector.tsx`, `RunDetailsModal.tsx`, `DashboardPage.tsx`) so `pnpm typecheck` passes cleanly across all 6 workspace packages.
