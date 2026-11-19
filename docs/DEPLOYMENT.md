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

## 5. Cloudflare Queues (Optional Async Offloading)

`v1-routes.ts` supports an optional `ANALYSIS_QUEUE` binding for offloading heavy post-ingest analysis and issue-tracker syncs:
1. Create the queue: `npx wrangler queues create flakecheck-analysis`
2. Add the producer binding to `services/gateway-service/wrangler.jsonc` and consumer binding to `services/analysis-service/wrangler.jsonc`.

---

## 6. Retention, Backup/Restore & GDPR/KVKK Compliance

- **Data Retention:** Each project in the `projects` table defines `retention_days` (default `90`). Schedule a weekly SQL/Cron cleanup pruning `runs` and `notification_deliveries` older than `retention_days`.
- **Backup & Restore:**
  - Neon automated daily snapshots + PITR (7–30 days depending on plan).
  - Manual logical backup: `pg_dump "$DATABASE_URL" --format=custom --file=flakecheck-backup.dump`
  - Restore: `pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists flakecheck-backup.dump`
- **GDPR / KVKK Rights:**
  - **Portability (Data Export):** Authenticated users call `GET /api/v1/account/export` to receive a portable JSON export of their profile, organization memberships, and audit logs.
  - **Right to Erasure:** Authenticated users call `DELETE /api/account/delete`, which cascades deletion across `users`, `sessions`, `oauth_accounts`, `project_tokens`, `repository_access`, and `organization_members`.
