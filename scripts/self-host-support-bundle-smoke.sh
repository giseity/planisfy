#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dogfood-output/self-host-support-bundle}"
LOG_DIR="$OUTPUT_DIR/logs"
BUNDLE_DIR="$OUTPUT_DIR/bundle"
SMOKE_ENV_FILE=""
SUFFIX="$(date -u +%Y%m%d%H%M%S)"
INTERNAL_SECRET="support-bundle-internal-secret-$SUFFIX"
AUTH_SECRET="support-bundle-auth-secret-$SUFFIX"
export COMPOSE_ANSI=never
export COMPOSE_PROGRESS=plain

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose --env-file "$SMOKE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  local status=$?
  if [[ -n "$SMOKE_ENV_FILE" && "$status" -ne 0 ]]; then
    mkdir -p "$LOG_DIR"
    compose logs --no-color postgres redis api >"$LOG_DIR/compose.log" 2>&1 || true
  fi
  if [[ -n "$SMOKE_ENV_FILE" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ -n "$SMOKE_ENV_FILE" && -f "$SMOKE_ENV_FILE" ]]; then
    rm -f "$SMOKE_ENV_FILE"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  for attempt in {1..90}; do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    if [[ "$attempt" -eq 90 ]]; then
      echo "$label did not become reachable: $url" >&2
      return 1
    fi
    sleep 2
  done
}

require_file() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    echo "Expected support bundle file is missing or empty: $path" >&2
    exit 1
  fi
}

assert_secret_absent() {
  local secret="$1"
  if grep -R -F "$secret" "$BUNDLE_DIR" >/dev/null 2>&1; then
    echo "Support bundle leaked secret value: $secret" >&2
    grep -R -n -F "$secret" "$BUNDLE_DIR" >&2 || true
    exit 1
  fi
}

require_cmd curl
require_cmd docker

mkdir -p "$OUTPUT_DIR"
rm -rf "$BUNDLE_DIR"
"$ROOT_DIR/scripts/self-host-setup.sh"

SMOKE_ENV_FILE="$(mktemp)"
if [[ -f "$ENV_FILE" ]]; then
  grep -Ev '^(DEPLOYMENT_MODE|STORAGE_PROVIDER|LOCAL_STORAGE_HOST_PATH|DEMO_PMTILES_PATH|BETTER_AUTH_SECRET|INTERNAL_API_SECRET)=' "$ENV_FILE" >"$SMOKE_ENV_FILE" || true
fi
{
  echo "DEPLOYMENT_MODE=self_host"
  echo "STORAGE_PROVIDER=local"
  echo "LOCAL_STORAGE_HOST_PATH=../../.storage"
  echo "DEMO_PMTILES_PATH=/data/pmtiles/stuttgart.pmtiles"
  echo "BETTER_AUTH_SECRET=$AUTH_SECRET"
  echo "INTERNAL_API_SECRET=$INTERNAL_SECRET"
} >>"$SMOKE_ENV_FILE"

trap cleanup EXIT

echo "Preparing clean self-host support-bundle stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d postgres redis api

wait_for_http "http://localhost:4000/health" "API"

echo "Generating support bundle"
ENV_FILE="$SMOKE_ENV_FILE" "$ROOT_DIR/scripts/self-host-support-bundle.sh" --output "$BUNDLE_DIR" >/dev/null

echo "Checking support bundle contents"
for file in \
  manifest.json \
  env.redacted.txt \
  compose.config.txt \
  compose.ps.txt \
  compose.logs.txt \
  api.health.json \
  api.health-detailed.json \
  api.metrics.txt
do
  require_file "$BUNDLE_DIR/$file"
done

grep -F '"composeFile": "infra/docker/docker-compose.yml"' "$BUNDLE_DIR/manifest.json" >/dev/null
grep -Fx 'INTERNAL_API_SECRET=<redacted>' "$BUNDLE_DIR/env.redacted.txt" >/dev/null
grep -Fx 'BETTER_AUTH_SECRET=<redacted>' "$BUNDLE_DIR/env.redacted.txt" >/dev/null
grep -F '"status":"ok"' "$BUNDLE_DIR/api.health.json" >/dev/null
grep -F 'planisfy_api_info' "$BUNDLE_DIR/api.metrics.txt" >/dev/null

assert_secret_absent "$INTERNAL_SECRET"
assert_secret_absent "$AUTH_SECRET"

echo "Self-host support-bundle smoke passed"
echo "bundle=$BUNDLE_DIR"
