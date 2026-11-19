#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FLAKECHECK_BASE_URL:-https://flakecheck.onurd.com.tr}"
BASE_URL="${BASE_URL%/}"

echo "=== FlakeCheck Production Deploy Check ==="
echo "Target: ${BASE_URL}"

# 1. Verify required local/CI env vars (never print secret values)
missing=0
for var in DATABASE_URL CRON_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "[WARN] Environment variable $var is not set in current shell (ensure it is configured via wrangler secret put)."
    missing=1
  else
    echo "[OK]   $var is set (redacted)"
  fi
done

# 2. Verify Drizzle migration files exist
for mig in drizzle/0005_misty_spitfire.sql drizzle/0006_tired_robin_chapel.sql; do
  if [[ ! -f "$mig" ]]; then
    echo "[FAIL] Missing migration file: $mig"
    exit 1
  fi
  echo "[OK]   Migration present: $mig"
done

# 3. Verify /health and /ready probes
health_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
ready_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/ready")
[[ "$health_code" == "200" ]] || { echo "[FAIL] /health returned HTTP ${health_code}"; exit 1; }
[[ "$ready_code" == "200" ]]  || { echo "[FAIL] /ready returned HTTP ${ready_code}"; exit 1; }
echo "[OK]   /health (200) and /ready (200)"

# 4. Verify cron endpoint rejects unauthenticated requests with 401 + WWW-Authenticate
cron_headers=$(curl -sS -D - -o /dev/null -X POST "${BASE_URL}/api/v1/internal/cron/digest?type=daily")
cron_status=$(echo "$cron_headers" | head -n 1 | awk '{print $2}')
if [[ "$cron_status" != "401" ]]; then
  echo "[FAIL] Unauthenticated cron endpoint returned HTTP ${cron_status}, expected 401"
  exit 1
fi
if ! echo "$cron_headers" | grep -qi "www-authenticate:.*bearer"; then
  echo "[FAIL] Cron 401 response missing WWW-Authenticate Bearer header"
  exit 1
fi
echo "[OK]   Cron endpoint enforces 401 + WWW-Authenticate without token"

# 5. Verify internal cron endpoints are NOT leaked in OpenAPI public spec
openapi_body=$(curl -sS "${BASE_URL}/api/v1/openapi.json")
if echo "$openapi_body" | grep -q "/internal/cron"; then
  echo "[FAIL] Internal cron routes must not appear in public OpenAPI spec"
  exit 1
fi
echo "[OK]   OpenAPI spec excludes internal cron routes"

echo "=== Deploy Check PASSED (missing local env warnings: ${missing}) ==="
