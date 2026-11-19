# FlakeCheck — Production & SEO Upgrade Changelog

**Date:** 2026-11-19  
**Baseline Commit:** `f0e14a5` → Production Release

---

## Summary of Implemented Features

### Section A — 10 Production Features
1. **Statistical Flakiness Scoring Engine** (`services/analysis-service/src/scoring.ts`)
   - Implemented Wilson 95% confidence intervals (`wilsonInterval`), rerun-based + cross-run history flip-rate fusion, composite 0–100 `flakinessScore`, configurable `ScoringConfig`, and `minSampleSize` false-positive suppression.
2. **Root Cause Classification Engine** (`services/analysis-service/src/root-cause.ts`)
   - Strict deterministic rule engine classifying all 6 required root causes (`timing_race`, `order_dependency`, `network_external`, `shared_state`, `resource_concurrency`, `environment_diff`) plus explicit `unknown`, with matched evidence snippets and actionable remediation advice.
3. **CI Integrations** (`ci-templates/`, `services/gateway-service/src/integrations.ts`, `v1-routes.ts`)
   - Added ready-to-use templates for GitHub Actions (composite Action), GitLab CI, CircleCI, and Jenkins.
   - Added GitHub PR Comment & Commit Status Check API integration and HMAC-verified `/api/v1/webhooks/ci` endpoint.
4. **Test Framework Adapters & Standard Formats** (`services/ingestion-service/src/parsers/adapters.ts`)
   - Added **CTRF**, **Vitest JSON**, and **Mocha JSON** adapters alongside existing JUnit XML, Jest, Playwright, Pytest, and Go test JSON parsers.
   - Added structured `ReportParseError` with clear remediation hints for malformed/empty payloads.
5. **Auto-Quarantine & Policy Engine** (`services/quarantine-service/src/policy.ts`, `v1-routes.ts`)
   - Configurable policy thresholds (`flakinessScoreThreshold`, `minFlipCount`, `minSampleSize`, `autoGraduatePasses`, `nonBlockingMode`), manual `override` protection, `quarantine_history` audit trail, and non-blocking CI gate evaluation.
6. **Notification & Alerting System** (`services/gateway-service/src/notifications.ts`)
   - Multi-channel delivery for Slack, Discord, Email (Resend), and HMAC-signed generic webhooks with deduplication window, hourly rate limiting, and daily/weekly digest builder.
7. **Authentication, Multi-Tenancy & Security** (`packages/shared-kernel/src/rbac.ts`, `services/gateway-service/src/security.ts`, `v1-routes.ts`)
   - Added `organizations`, `organization_members`, `projects`, `audit_logs`, RBAC (`owner`/`admin`/`member`/`viewer`), scoped expiring API keys, Zod input validation, sliding-window rate limiting, and strict CSP/HSTS/security headers.
8. **Analytics & Cost Reporting** (`services/gateway-service/src/badge.ts`, `v1-routes.ts`)
   - Added `/api/v1/analytics/overview` (30-run trend, top-10 flakiest tests, CI waste cost, team breakdown) and dynamic SVG README badge endpoint `/api/v1/badge/:owner/:repo.svg`.
9. **Issue Trackers, Public API & CLI** (`services/gateway-service/src/integrations.ts`, `openapi.ts`, `packages/cli/src/index.ts`)
   - Added GitHub Issues, Jira Cloud REST v3, and Linear GraphQL auto-open/auto-close clients.
   - Added OpenAPI 3.1 spec (`/api/v1/openapi.json`) and interactive docs (`/docs/api`).
   - Added `flakecheck doctor [--json]`, `--json` output on `report`, and `ctrf`/`vitest`/`mocha` CLI formats.
10. **Reliability, Observability & DevOps** (`packages/shared-kernel/src/logger.ts`, `resilience.ts`, `drizzle/0005_misty_spitfire.sql`, `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`)
    - Structured JSON logger with automatic secret redaction, Neon retry/timeout helper, `/ready` readiness probe, `Idempotency-Key` ingest protection, optional Cloudflare Queues hook, staging/production Wrangler envs, CI pipeline, and GDPR/KVKK data export (`/api/v1/account/export`).

### Section B — Technical & Content SEO
- Edge-SSR public landing page, `/guides` hub, 9 technical guides, 2 honest comparison pages, `/changelog`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and dynamic `/og/:slug.svg` cards.
- Full JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `Article`, `BreadcrumbList`), `noindex` on SPA dashboard/auth routes, and optimized npm CLI metadata.

---

## Remaining Risks & Recommended Next Steps
1. **Distributed Rate Limiting:** The sliding-window rate limiter in `security.ts` operates per Workers isolate; for strict global enforcement at high RPS, attach a Cloudflare Rate Limiting binding or Durable Object.
2. **Scheduled Digest & Retention Cron:** Configure a Cloudflare Cron Trigger in `gateway-service` to invoke daily/weekly digest dispatch and prune rows older than `projects.retention_days`.
3. **Production Deployment & Live Lighthouse Run:** Run `pnpm db:migrate` against Neon and deploy workers via `wrangler deploy`, then execute Lighthouse against the live URL and complete external Search Console/Bing/launch items in `docs/SEO_CHECKLIST.md`.
