#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  compose down -v --remove-orphans
}

require_cmd docker
require_cmd curl
require_cmd node

trap cleanup EXIT

"$ROOT_DIR/scripts/self-host-setup.sh"

echo "Validating Docker Compose configuration"
compose config >/dev/null

echo "Starting smoke-test services"
compose up -d postgres redis api

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

echo "Docker Compose smoke test passed"
