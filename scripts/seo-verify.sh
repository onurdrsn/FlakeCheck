#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FLAKECHECK_BASE_URL:-https://flakecheck.onurd.com.tr}"
BASE_URL="${BASE_URL%/}"

echo "=== FlakeCheck Post-Deploy SEO Verification ==="
echo "Target: ${BASE_URL}"

# 1. Discovery files
for path in /sitemap.xml /robots.txt /llms.txt; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}${path}")
  [[ "$code" == "200" ]] || { echo "[FAIL] ${path} returned HTTP ${code}"; exit 1; }
  echo "[OK]   ${path} (200)"
done

# 2. Public SSR pages: single <h1>, canonical, valid JSON-LD
PUBLIC_PAGES=(
  "/"
  "/guides"
  "/guides/what-is-a-flaky-test"
  "/guides/how-to-detect-flaky-tests"
  "/compare/flakecheck-vs-buildpulse"
  "/changelog"
)

for route in "${PUBLIC_PAGES[@]}"; do
  html=$(curl -sS "${BASE_URL}${route}")
  h1_count=$(echo "$html" | grep -oi "<h1[^>]*>" | wc -l | tr -d ' ')
  if [[ "$h1_count" != "1" ]]; then
    echo "[FAIL] ${route} has ${h1_count} <h1> tags (expected exactly 1)"
    exit 1
  fi
  if ! echo "$html" | grep -qi '<link rel="canonical"'; then
    echo "[FAIL] ${route} missing <link rel=\"canonical\">"
    exit 1
  fi
  # Validate all JSON-LD blocks parse cleanly with node
  node -e '
    const html = require("fs").readFileSync(0, "utf8");
    const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    if (matches.length === 0) { console.error("No JSON-LD found"); process.exit(1); }
    for (const m of matches) JSON.parse(m[1]);
  ' <<< "$html" || { echo "[FAIL] ${route} invalid JSON-LD"; exit 1; }
  echo "[OK]   ${route} (single h1, canonical, valid JSON-LD)"
done

# 3. Dashboard / Auth routes must carry noindex
for priv in /app /login; do
  html=$(curl -sS "${BASE_URL}${priv}")
  if ! echo "$html" | grep -qi "noindex"; then
    echo "[FAIL] ${priv} is missing noindex directive"
    exit 1
  fi
  echo "[OK]   ${priv} has noindex"
done

echo "=== SEO Verification PASSED ==="
