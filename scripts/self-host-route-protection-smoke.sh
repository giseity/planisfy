#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dogfood-output/self-host-route-protection}"
LOG_DIR="$OUTPUT_DIR/logs"
SMOKE_ENV_FILE=""
export COMPOSE_ANSI=never
export COMPOSE_PROGRESS=plain

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
    }
  ' "$SMOKE_ENV_FILE" | tail -n 1
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

expect_status() {
  local expected="$1"
  local label="$2"
  shift 2
  local response_file status
  response_file="$(mktemp)"
  status="$(curl -sS -o "$response_file" -w "%{http_code}" "$@" || true)"
  if [[ "$status" != "$expected" ]]; then
    echo "$label expected HTTP $expected, got $status" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    exit 1
  fi
  rm -f "$response_file"
}

require_cmd curl
require_cmd docker

mkdir -p "$OUTPUT_DIR"
"$ROOT_DIR/scripts/self-host-setup.sh"

SMOKE_ENV_FILE="$(mktemp)"
if [[ -f "$ENV_FILE" ]]; then
  grep -Ev '^(DEPLOYMENT_MODE|STORAGE_PROVIDER|LOCAL_STORAGE_HOST_PATH|DEMO_PMTILES_PATH)=' "$ENV_FILE" >"$SMOKE_ENV_FILE" || true
fi
{
  echo "DEPLOYMENT_MODE=self_host"
  echo "STORAGE_PROVIDER=local"
  echo "LOCAL_STORAGE_HOST_PATH=../../.storage"
  echo "DEMO_PMTILES_PATH=/data/pmtiles/stuttgart.pmtiles"
} >>"$SMOKE_ENV_FILE"

trap cleanup EXIT

echo "Preparing clean self-host route-protection stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d postgres redis api

wait_for_http "http://localhost:4000/health" "API"

secret="$(env_value INTERNAL_API_SECRET)"
if [[ -z "$secret" ]]; then
  echo "INTERNAL_API_SECRET is missing from smoke env" >&2
  exit 1
fi

echo "Checking public health remains unauthenticated"
expect_status 200 "public health" http://localhost:4000/health

echo "Checking protected diagnostics reject missing and invalid secrets"
for path in /health/detailed /metrics /setup/preflight /internal/managed-smoke; do
  expect_status 401 "$path without secret" "http://localhost:4000$path"
  expect_status 401 "$path with invalid secret" -H "x-internal-secret: wrong-secret" "http://localhost:4000$path"
done

echo "Checking protected diagnostics accept the internal secret"
expect_status 200 "authorized detailed health" -H "x-internal-secret: $secret" http://localhost:4000/health/detailed
expect_status 200 "authorized metrics" -H "x-internal-secret: $secret" http://localhost:4000/metrics
expect_status 200 "authorized setup preflight" -H "x-internal-secret: $secret" http://localhost:4000/setup/preflight

echo "Self-host route-protection smoke passed"
