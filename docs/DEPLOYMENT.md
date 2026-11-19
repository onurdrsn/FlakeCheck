# FlakeCheck — Production Deployment & Operations Guide

This guide covers everything required to deploy, migrate, monitor, back up, and operate FlakeCheck from scratch on **Cloudflare Workers** + **Neon PostgreSQL**.

---

## 1. Prerequisites
- Node.js `>= 20` and `pnpm` (`10.5.2`)
- Cloudflare account with Workers & Assets enabled (`npx wrangler login`)
- Neon PostgreSQL project (create separate `staging` and `production` branches in Neon)

---

## 2. Database Setup & Migration Strategy (Drizzle + Neon)

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon pooled connection string (`?sslmode=require`).
2. Apply all Drizzle SQL migrations (`drizzle/0000_*.sql` through `drizzle/0005_*.sql`):
   ```bash
   pnpm install --frozen-lockfile
   pnpm db:migrate
   ```
3. **Zero-Downtime Migration Strategy:**
   - All schema migrations are additive (`CREATE TABLE`, `ADD COLUMN ... DEFAULT ...`).
   - Run `pnpm db:migrate` against a Neon branch preview first, verify `GET /ready`, then promote to production.
   - Neon point-in-time restore (PITR) provides instant rollback to any timestamp prior to migration.

---

## 3. Secrets Management (Cloudflare Secrets)

Never commit secrets to `wrangler.jsonc` or Git. Configure them via `wrangler secret put`:

```bash
# Required across all workers
npx wrangler secret put DATABASE_URL --cwd services/gateway-service
npx wrangler secret put DATABASE_URL --cwd services/ingestion-service
npx wrangler secret put DATABASE_URL --cwd services/analysis-service
npx wrangler secret put DATABASE_URL --cwd services/quarantine-service

# Gateway authentication, webhooks & integrations
npx wrangler secret put JWT_SECRET --cwd services/gateway-service
npx wrangler secret put FLAKECHECK_PROJECT_TOKENS --cwd services/gateway-service
npx wrangler secret put CI_WEBHOOK_SECRET --cwd services/gateway-service
npx wrangler secret put RESEND_API_KEY --cwd services/gateway-service
npx wrangler secret put GITHUB_CLIENT_ID --cwd services/gateway-service
npx wrangler secret put GITHUB_CLIENT_SECRET --cwd services/gateway-service
npx wrangler secret put GITHUB_TOKEN --cwd services/gateway-service
```

---

## 4. Deploying Staging & Production Environments

Build all packages and deploy workers in dependency order (leaf workers first, then Gateway):

```bash
pnpm typecheck
pnpm test
pnpm build

# Deploy to Staging
npx wrangler deploy --cwd services/ingestion-service
npx wrangler deploy --cwd services/analysis-service
npx wrangler deploy --cwd services/quarantine-service
npx wrangler deploy --cwd services/gateway-service --env staging

# Deploy to Production
npx wrangler deploy --cwd services/gateway-service --env production
```

Verify deployment:
```bash
curl -sf https://flakecheck.onurd.com.tr/ready
curl -sf https://flakecheck.onurd.com.tr/health
npx @onurdrsn/flakecheck doctor --gateway https://flakecheck.onurd.com.tr --json
```

---

## 5. Scheduled Jobs via cron-job.org (No Cloudflare Cron Triggers)

FlakeCheck intentionally does **not** use Cloudflare Cron Triggers. All scheduled jobs are triggered externally by **cron-job.org** via HTTPS `POST` requests authenticated with `Authorization: Bearer <CRON_SECRET>`.

### 5.1 Configure Cloudflare Secrets (Separate Tokens for Staging & Production)
```bash
# Production
openssl rand -hex 32 | npx wrangler secret put CRON_SECRET --cwd services/gateway-service --env production

# Staging (use a different secret!)
openssl rand -hex 32 | npx wrangler secret put CRON_SECRET --cwd services/gateway-service --env staging
```

**Zero-Downtime Token Rotation:**
1. Set the current `CRON_SECRET` value into `CRON_SECRET_PREVIOUS`.
2. Set the newly generated token into `CRON_SECRET`.
3. Re-run `scripts/cronjob-sync.ts` (or update the header in cron-job.org Console).
4. Once all jobs succeed with the new token, clear `CRON_SECRET_PREVIOUS`.

### 5.2 Automated Setup via `scripts/cronjob-sync.ts`
Uses the official `https://api.cron-job.org` REST API (idempotent: matches by job title, creates with `PUT /jobs` or updates with `PATCH /jobs/{jobId}`). Timezone defaults to **UTC**.

```bash
# Preview planned jobs without calling cron-job.org (secrets are redacted)
FLAKECHECK_ENV=production \
FLAKECHECK_BASE_URL=https://flakecheck.onurd.com.tr \
CRON_SECRET="$PROD_CRON_SECRET" \
pnpm tsx scripts/cronjob-sync.ts --dry-run

# Sync Production jobs
FLAKECHECK_ENV=production \
FLAKECHECK_BASE_URL=https://flakecheck.onurd.com.tr \
CRON_SECRET="$PROD_CRON_SECRET" \
CRONJOB_API_KEY="$CRONJOB_API_KEY" \
pnpm tsx scripts/cronjob-sync.ts

# Sync Staging jobs (separate job set + token)
FLAKECHECK_ENV=staging \
FLAKECHECK_BASE_URL=https://staging.flakecheck.onurd.com.tr \
CRON_SECRET="$STAGING_CRON_SECRET" \
CRONJOB_API_KEY="$CRONJOB_API_KEY" \
pnpm tsx scripts/cronjob-sync.ts
```

### 5.3 Manual Setup Alternative (cron-job.org Console)
If you prefer creating jobs manually in [console.cron-job.org](https://console.cron-job.org), create three jobs in **UTC** timezone with **Request method = `POST`**, **Timeout = `30s`**, **Notify on failure = Enabled**, and custom header `Authorization: Bearer <CRON_SECRET>`:

| Job Title | Method & URL | Schedule (UTC) |
|---|---|---|
| `[FlakeCheck:production] Daily Digest` | `POST https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=daily` | Every day at `08:00` (`0 8 * * *`) |
| `[FlakeCheck:production] Weekly Digest` | `POST https://flakecheck.onurd.com.tr/api/v1/internal/cron/digest?type=weekly` | Every Monday at `09:00` (`0 9 * * 1`) |
| `[FlakeCheck:production] Data Retention` | `POST https://flakecheck.onurd.com.tr/api/v1/internal/cron/retention?dryRun=false` | Every Sunday at `03:00` (`0 3 * * 0`) |

---

## 6. Distributed Rate Limiting (Durable Objects)

`gateway-service` binds `RATE_LIMITER_DO` (`RateLimiterDO`) for atomic edge-wide rate limiting. Limits are configurable via `wrangler.jsonc` vars:
- `RATE_LIMIT_AUTH_MAX` (default `20` / min)
- `RATE_LIMIT_INGEST_MAX` (default `120` / min)
- `RATE_LIMIT_BADGE_MAX` (default `300` / min)
- `RATE_LIMIT_CRON_MAX` (default `10` / min)
- `RATE_LIMIT_API_MAX` (default `180` / min)

---

## 7. Migration Rollback Notes (`0005` & `0006`), Backup & GDPR/KVKK

- **Zero-Downtime Rollback:** Both `drizzle/0005_misty_spitfire.sql` and `drizzle/0006_tired_robin_chapel.sql` are strictly additive (`CREATE TABLE`, `ADD COLUMN ... DEFAULT ...`). Rolling back application code requires no immediate schema revert. To fully revert schema state, use Neon Point-in-Time Restore (PITR) or drop only the newly added tables (`cron_runs`, `ingest_idempotency`, `tracked_issues`, `issue_tracker_configs`, `audit_logs`, `notification_deliveries`, `notification_preferences`, `quarantine_history`, `quarantine_policies`, `projects`, `organization_members`, `organizations`) after confirming no data dependency.
- **Logical Backup / Restore:**
  - `pg_dump "$DATABASE_URL" --format=custom --file=flakecheck-backup.dump`
  - `pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists flakecheck-backup.dump`
- **GDPR / KVKK Rights:**
  - Data Export: `GET /api/v1/account/export`
  - Right to Erasure: `DELETE /api/account/delete`

---

## 8. Post-Deploy Verification Scripts

```bash
chmod +x scripts/deploy-check.sh scripts/seo-verify.sh
FLAKECHECK_BASE_URL=https://flakecheck.onurd.com.tr ./scripts/deploy-check.sh
FLAKECHECK_BASE_URL=https://flakecheck.onurd.com.tr ./scripts/seo-verify.sh
```
