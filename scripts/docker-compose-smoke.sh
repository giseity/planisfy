#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
SMOKE_ENV_FILE=""

compose() {
  docker compose --env-file "${SMOKE_ENV_FILE:-$ENV_FILE}" -f "$COMPOSE_FILE" "$@"
}

compose_up() {
  local args=(-d)
  case "${SMOKE_FORCE_REBUILD:-false}" in
    1 | true | TRUE | yes | YES) args+=(--build --force-recreate) ;;
  esac
  compose up "${args[@]}" "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$SMOKE_ENV_FILE" ]]; then
    compose down -v --remove-orphans
  fi
  if [[ -n "$SMOKE_ENV_FILE" && -f "$SMOKE_ENV_FILE" ]]; then
    rm -f "$SMOKE_ENV_FILE"
  fi
}

require_cmd docker
require_cmd curl
require_cmd node

trap cleanup EXIT

"$ROOT_DIR/scripts/self-host-setup.sh"

SMOKE_ENV_FILE="$(mktemp)"
if [[ -f "$ENV_FILE" ]]; then
  grep -Ev '^(DEPLOYMENT_MODE|STORAGE_PROVIDER|LOCAL_STORAGE_HOST_PATH|DEMO_PMTILES_PATH)=' "$ENV_FILE" >"$SMOKE_ENV_FILE" || true
fi
{
  echo "DEPLOYMENT_MODE=${SMOKE_DEPLOYMENT_MODE:-self_host}"
  echo "STORAGE_PROVIDER=${SMOKE_STORAGE_PROVIDER:-local}"
  echo "LOCAL_STORAGE_HOST_PATH=${SMOKE_LOCAL_STORAGE_HOST_PATH:-../../.storage}"
  echo "DEMO_PMTILES_PATH=${SMOKE_DEMO_PMTILES_PATH:-/data/pmtiles/stuttgart.pmtiles}"
} >>"$SMOKE_ENV_FILE"

echo "Validating Docker Compose configuration"
compose config >/dev/null

echo "Preparing clean smoke-test stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true

echo "Checking seeded style fixtures"
for style in \
  planisfy-streets-v1.json \
  planisfy-streets-light-v1.json \
  planisfy-streets-dark-v1.json
do
  if [[ ! -f "$ROOT_DIR/infra/docker/data/storage/styles/$style" ]]; then
    echo "Missing seeded style fixture: $style" >&2
    exit 1
  fi
done

echo "Checking Martin fixture aliases"
for expected in \
  'stuttgart-base: "/data/stuttgart.pmtiles"' \
  'planisfy.basic: "/data/stuttgart.pmtiles"' \
  'planisfy.basic.v1: "/data/stuttgart.pmtiles"'
do
  if ! grep -Fq "$expected" "$ROOT_DIR/infra/docker/configs/martin.yaml"; then
    echo "Martin config is missing expected alias: $expected" >&2
    exit 1
  fi
done

echo "Starting smoke-test services"
compose_up postgres redis api

echo "Waiting for API health"
for attempt in {1..60}; do
  if curl -fsS http://localhost:4000/health >/dev/null; then
    break
  fi

  if [[ "$attempt" -eq 60 ]]; then
    echo "API did not become healthy in time" >&2
    compose logs api >&2
    exit 1
  fi

  sleep 2
done

echo "Checking public setup preflight"
preflight="$(curl -fsS http://localhost:4000/setup/preflight)"
PREFLIGHT_JSON="$preflight" node <<'NODE'
const body = JSON.parse(process.env.PREFLIGHT_JSON ?? "{}");
const checks = new Map((body.data?.checks ?? []).map((check) => [check.id, check]));
const required = [
  "storage",
  "upload-storage",
  "demo-style-fixtures",
  "martin-source-aliases",
  "demo-pmtiles",
];
for (const id of required) {
  if (!checks.has(id)) {
    console.error(`Setup preflight is missing '${id}'`);
    process.exit(1);
  }
}
for (const id of ["storage", "upload-storage", "demo-style-fixtures", "martin-source-aliases"]) {
  const check = checks.get(id);
  if (check.status !== "pass") {
    console.error(`Setup preflight check '${id}' did not pass: ${check.message}`);
    process.exit(1);
  }
}
const demoPmtiles = checks.get("demo-pmtiles");
if (demoPmtiles.status === "warn") {
  console.warn(demoPmtiles.message);
} else if (demoPmtiles.status !== "pass") {
  console.error(`Setup preflight check 'demo-pmtiles' failed: ${demoPmtiles.message}`);
  process.exit(1);
}
NODE

echo "Checking detailed health"
detailed="$(curl -fsS http://localhost:4000/health/detailed)"
for check in postgres redis storage workerGeodata martin valhalla; do
  if ! grep -q "\"$check\"" <<<"$detailed"; then
    echo "Detailed health is missing '$check'" >&2
    echo "$detailed" >&2
    exit 1
  fi
done

if curl -fsS http://localhost:3005/catalog >/dev/null 2>&1; then
  echo "Martin catalog is reachable"
else
  echo "Martin catalog is not running in this smoke subset; skipping direct catalog check"
fi

if [[ -f "$ROOT_DIR/infra/docker/data/pmtiles/stuttgart.pmtiles" ]]; then
  echo "Starting Martin for optional fixture TileJSON check"
  compose_up martin
  if curl -fsS http://localhost:3005/planisfy.basic >/dev/null 2>&1; then
    echo "Fixture TileJSON is reachable"
  else
    echo "Fixture PMTiles exists, but Martin TileJSON was not reachable" >&2
    compose logs martin >&2
    exit 1
  fi
  node "$ROOT_DIR/scripts/self-host-default-map-smoke.mjs"
else
  echo "Demo PMTiles fixture is missing; skipping optional TileJSON check"
fi

echo "Docker Compose smoke test passed"
