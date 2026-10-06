# FlakeCheck

FlakeCheck is a repository-scoped CI reliability platform. It ingests test reports at the edge, normalizes attempts and failure signatures, classifies flaky behavior deterministically, and exposes evidence through a Gateway Worker, React dashboard, and HTTP-only CLI.

[How to use FlakeCheck](HOW-TO-USE.md) · [CLI usage](#cli)

## Architecture

```text
CI reports
    │
    ▼
Gateway Worker ── Service Bindings ── Ingestion Worker ── Neon PostgreSQL
    │                                  Analysis Worker ────┘
    │                                  Quarantine Worker ──┘
    │
    ├── REST API
    ├── React dashboard (Static Assets)
    └── flakecheck CLI
```

The monorepo is organized as follows:

```text
packages/
  shared-kernel/       Drizzle schema, hashes, sanitization, signatures, RPC types
  cli/                 flakecheck executable; Gateway REST only
services/
  ingestion-service/   Streaming JUnit/Jest/Playwright/pytest/Go parsers and DB writer
  analysis-service/    Immutable sliding-window classification and waste calculations
  quarantine-service/  Quarantine lifecycle, graduation, skip-list artifacts, Cron
  gateway-service/     Authenticated REST API and React dashboard
```

The Workers intentionally use `drizzle-orm/neon-http`. Inserts are idempotent and chunked at 500 rows; a later chunk can fail after earlier chunks have committed, and the response reports that partial-batch failure.

## Requirements

- Node.js 20 or newer
- pnpm 11 (`corepack enable` is recommended)
- Cloudflare Wrangler 4 for deployment
- A Neon PostgreSQL database with the shared schema applied

## Local development

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
```

The same workflows are available through the Makefile:

```sh
make install
make build
make test
make typecheck
make dev
```

`make dev` starts the Vite dashboard and all four local Workers in parallel, so Gateway service bindings are available during dashboard use:

| Process | Port |
|---|---:|
| Vite dashboard | 5173 |
| Gateway Worker | 8787 |
| Ingestion Worker | 8788 |
| Analysis Worker | 8789 |
| Quarantine Worker | 8790 |

Use `make dev-pages` for only the Vite dashboard or `make dev-worker` for only the Gateway. If the Gateway is started alone, calls to `/api/analyze`, `/api/summary`, and other binding-backed routes fail because the local Analysis, Ingestion, and Quarantine Workers are not running.

Each local Worker also uses a separate Wrangler inspector port (`9230`–`9233`) so concurrent `workerd` processes do not collide on the default `9229`.

Database commands (`make db-migrate`, `make db-push`, and `make db-seed`) read `DATABASE_URL` from the shell first, then the root `.env`, and finally `services/gateway-service/.dev.vars`. For a real database, prefer an explicit command such as `DATABASE_URL='postgresql://...' make db-migrate`; the committed local `.dev.vars` value is only a development placeholder.

## Environment and secrets

Workers need a Neon connection string:

```text
DATABASE_URL=postgresql://user:password@ep-example.us-east-2.aws.neon.tech/flakecheck?sslmode=require
```

The Gateway requires `FLAKECHECK_PROJECT_TOKENS`, a JSON object mapping each canonical repository to the SHA-256 digest of its API token. Store digests, never plaintext tokens:

```json
{
  "acme/payments": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Gateway authentication secrets also include `JWT_SECRET` for 30-day HttpOnly session cookies and `RESEND_API_KEY` plus `RESEND_FROM_EMAIL` for five-minute, single-use passwordless OTP delivery. Optional OAuth credentials are `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`; set `PUBLIC_APP_URL` to the deployed Gateway origin for callback URLs. Optional outbound notifications use `SLACK_WEBHOOK_URL` and `DISCORD_WEBHOOK_URL`. These values are Cloudflare secrets, not source configuration.

For local Wrangler development, each Worker has its own ignored `.dev.vars` file next to its `wrangler.jsonc`:

```text
services/gateway-service/.dev.vars
services/ingestion-service/.dev.vars
services/analysis-service/.dev.vars
services/quarantine-service/.dev.vars
```

The Gateway file contains `DATABASE_URL`, `FLAKECHECK_PROJECT_TOKENS`, `JWT_SECRET`, Resend/OAuth settings, `PUBLIC_APP_URL`, and Slack/Discord webhook keys. The other three files contain `DATABASE_URL` and `SERVICE_NAME`. The bundled local Gateway example uses `local-dev-token` for `acme/payments`; its SHA-256 digest is stored in `FLAKECHECK_PROJECT_TOKENS`. Replace all local placeholders before using real services, and keep `.dev.vars` files out of version control.

Set Cloudflare secrets per Worker/environment:

```sh
printf '%s' 'postgresql://...' | pnpm exec wrangler secret put DATABASE_URL --config services/ingestion-service/wrangler.jsonc
printf '%s' 'postgresql://...' | pnpm exec wrangler secret put DATABASE_URL --config services/analysis-service/wrangler.jsonc
printf '%s' 'postgresql://...' | pnpm exec wrangler secret put DATABASE_URL --config services/quarantine-service/wrangler.jsonc
printf '%s' 'postgresql://...' | pnpm exec wrangler secret put DATABASE_URL --config services/gateway-service/wrangler.jsonc
printf '%s' '{"acme/payments":"<sha256-token-digest>"}' | pnpm exec wrangler secret put FLAKECHECK_PROJECT_TOKENS --config services/gateway-service/wrangler.jsonc
```

For local CLI use, create `.flakecheckrc.json` with `flakecheck init`; it is repository-scoped and should not be committed. The CLI token is sent only to the Gateway as `X-FlakeCheck-Token`.

Copy `.env.example` for local tooling. Do not commit a populated `.env`; production values belong in Cloudflare Secrets.

## CLI

The CLI is published as `@flakecheck/cli`; users do not need to clone this repository:

```sh
npm install --global @flakecheck/cli
# or use it without a global install:
npx @flakecheck/cli server --url https://flakecheck.example.com
```

The scoped package is configured for public npm publishing. From the repository root, publish it with:

```sh
pnpm --filter @flakecheck/cli run build
pnpm --filter @flakecheck/cli publish --access public
```

Open the hosted web dashboard from any project directory:

```sh
export FLAKECHECK_DASHBOARD_URL=https://flakecheck.example.com
flakecheck server
```

Use `--no-open` in CI or headless environments. `server` opens the FlakeCheck web application; it does not start a local database or Cloudflare Workers. The hosted Gateway/Workers remain the production runtime, while the CLI uploads reports over HTTPS.

Build and invoke the local binary:

```sh
pnpm --filter @flakecheck/cli run build
node packages/cli/dist/index.js --help
```

For local development, use the built binary explicitly or link it once:

```sh
node packages/cli/dist/index.js init \
  --gateway http://localhost:8787 \
  --repo onurdrsn/ATS-Analyzer \
  --token "$FLAKECHECK_TOKEN"
node packages/cli/dist/index.js doctor
```

If `flakecheck` is installed globally, rebuild or relink it after changing the CLI. A stale binary can continue to report `duplex option is required when sending a body` when streaming a report:

```sh
pnpm --filter @flakecheck/cli run build
pnpm link --global ./packages/cli
flakecheck doctor
```

Initialize a repository configuration:

```sh
flakecheck init \
  --gateway https://flakecheck.example.com \
  --repo acme/payments \
  --token "$FLAKECHECK_TOKEN"
```

Ingest a report. Supported formats are `junit`, `jest`, `playwright`, `pytest`, and `go`. Files are streamed to the Gateway and glob paths are normalized across operating systems:

```sh
flakecheck ingest test-results/junit.xml --format junit
flakecheck ingest "reports/**/*.json" --format jest
```

The report must already exist. A complete local flow is:

```sh
# Run your test command and configure it to write a JUnit report.
pnpm test -- --reporter=junit --outputFile=reports/junit.xml

# Upload the generated report, classify it, then inspect the findings.
flakecheck ingest reports/junit.xml --format junit
flakecheck analyze --window 30
flakecheck flakes
```

For the FlakeCheck repository itself, the fixture report can be used to verify the local stack:

```sh
flakecheck ingest services/ingestion-service/tests/fixtures/junit.xml --format junit
flakecheck analyze
flakecheck flakes --format json
```

Run deterministic analysis. Exit status is `0` for a clean result, `2` when `--fail-on-flake` finds flakes, and `1` for operational errors:

```sh
flakecheck analyze --window 30 --fail-on-flake
```

Inspect and export active flakes:

```sh
flakecheck flakes --format table
flakecheck flakes --format json
flakecheck export --target csv --output flake-report.csv
flakecheck export --target json --output flake-report.json
flakecheck export --target markdown
```

Manage quarantine and check the deployment:

```sh
flakecheck quarantine <test_id> --action add --reason "repeated CI flake"
flakecheck quarantine <test_id> --action remove
flakecheck quarantine <test_id> --action list
flakecheck doctor
flakecheck demo
```

`POST /api/auth/otp/request` starts passwordless sign-in and `/api/auth/otp/verify` establishes the session. Google and GitHub are available at `/api/auth/google` and `/api/auth/github`. Sessions are never written to `localStorage` or `sessionStorage`; refresh is issued through the Secure, HttpOnly session cookie. Account removal is available at `DELETE /api/account/delete`, and legal pages are served at `/terms` and `/privacy`.

### Passwordless OTP and OAuth setup

1. Create a Resend API key and verify the sender domain.
2. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `JWT_SECRET`, and `PUBLIC_APP_URL` as Gateway Worker secrets.
3. Register Google and/or GitHub OAuth applications with callbacks `https://<gateway-host>/api/auth/google/callback` and `https://<gateway-host>/api/auth/github/callback`.
4. Set the matching OAuth client ID and secret secrets, then deploy the Gateway.
5. The client requests an OTP at `/api/auth/otp/request`; the code expires after 300 seconds and is invalidated after one successful use. Verification requires Terms and Privacy acceptance and returns only a Secure, HttpOnly cookie.

## Deployment

Build all packages and Workers before deployment:

```sh
make build
make deploy
```

`make deploy` runs the four Worker deployments in dependency order. Validate configuration without uploading with:

```sh
make dry-run
```

Database lifecycle commands are also available:

```sh
make db-generate   # or pnpm db:generate
make db-migrate    # or pnpm db:migrate
make db-push       # or pnpm db:push
make db-seed       # or pnpm db:seed
```

`pnpm db:migrate` applies generated migrations to the Neon database, while `pnpm db:push` is intended only for development. `pnpm db:seed` requires `DATABASE_URL` and optionally accepts `FLAKECHECK_SEED_REPO`.

## GitHub Actions reporting

After configuring the CLI in a CI job, ingest and analyze reports, then publish the Markdown report to the workflow summary:

```yaml
- name: Install FlakeCheck
  run: pnpm install --frozen-lockfile
- name: Configure FlakeCheck
  run: pnpm --filter @flakecheck/cli run build
  env:
    FLAKECHECK_TOKEN: ${{ secrets.FLAKECHECK_TOKEN }}
- name: Analyze flakes
  run: |
    node packages/cli/dist/index.js ingest test-results/junit.xml --format junit
    node packages/cli/dist/index.js analyze --window 30 --fail-on-flake
    node packages/cli/dist/index.js report --format github-pr --dashboard "$FLAKECHECK_DASHBOARD_URL"
  env:
    GITHUB_STEP_SUMMARY: ${{ env.GITHUB_STEP_SUMMARY }}
    FLAKECHECK_DASHBOARD_URL: https://flakecheck.example.com
```

`flakecheck report` writes the same Markdown to stdout and appends it to the file designated by `$GITHUB_STEP_SUMMARY`. Configure the token with `flakecheck init` in a prior CI step, or create `.flakecheckrc.json` from protected secrets without committing it.

The Gateway Worker serves the compiled React SPA from `services/gateway-service/public`. Its Service Bindings target the ingestion, analysis, and quarantine Worker names in `services/gateway-service/wrangler.jsonc`.

## Verification

The production readiness checks are:

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
make dry-run
```

The test suite covers streaming parsers, sanitization, signature normalization, identity hashing, deterministic classifier precedence, waste formulas, chunk writers, quarantine graduation, repository-scoped auth, Gateway routes, and CLI contracts.
