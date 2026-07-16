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

env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
    }
  ' "${SMOKE_ENV_FILE:-$ENV_FILE}" | tail -n 1
}

resolve_compose_path() {
  local path="$1"
  local compose_dir
  compose_dir="$(cd "$(dirname "$COMPOSE_FILE")" && pwd)"

  case "$path" in
    /*) printf '%s\n' "$path" ;;
    */*)
      local parent="${path%/*}"
      local base="${path##*/}"
      if [[ -d "$compose_dir/$parent" ]]; then
        printf '%s/%s\n' "$(cd "$compose_dir/$parent" && pwd)" "$base"
      else
        printf '%s/%s\n' "$compose_dir" "$path"
      fi
      ;;
    *) printf '%s/%s\n' "$compose_dir" "$path" ;;
  esac
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
  grep -Ev '^(DEPLOYMENT_MODE|STORAGE_PROVIDER|LOCAL_STORAGE_HOST_PATH|DEMO_PMTILES_PATH|S3_BUCKET|S3_REGION|S3_ENDPOINT|CONTAINER_S3_ENDPOINT|S3_PUBLIC_URL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD)=' "$ENV_FILE" >"$SMOKE_ENV_FILE" || true
fi
{
  echo "DEPLOYMENT_MODE=${SMOKE_DEPLOYMENT_MODE:-self_host}"
  echo "STORAGE_PROVIDER=${SMOKE_STORAGE_PROVIDER:-s3}"
  echo "LOCAL_STORAGE_HOST_PATH=${SMOKE_LOCAL_STORAGE_HOST_PATH:-../../.storage}"
  echo "DEMO_PMTILES_PATH=${SMOKE_DEMO_PMTILES_PATH:-/data/pmtiles/stuttgart.pmtiles}"
  echo "S3_BUCKET=${SMOKE_S3_BUCKET:-planisfy-artifacts}"
  echo "S3_REGION=${SMOKE_S3_REGION:-auto}"
  echo "S3_ENDPOINT=${SMOKE_S3_ENDPOINT:-http://localhost:9000}"
  echo "CONTAINER_S3_ENDPOINT=${SMOKE_CONTAINER_S3_ENDPOINT:-http://minio:9000}"
  echo "S3_PUBLIC_URL=${SMOKE_S3_PUBLIC_URL:-http://localhost:9000/planisfy-artifacts}"
  echo "AWS_ACCESS_KEY_ID=${SMOKE_AWS_ACCESS_KEY_ID:-planisfy}"
  echo "AWS_SECRET_ACCESS_KEY=${SMOKE_AWS_SECRET_ACCESS_KEY:-planisfy-local-minio-password}"
  echo "MINIO_ROOT_USER=${SMOKE_MINIO_ROOT_USER:-planisfy}"
  echo "MINIO_ROOT_PASSWORD=${SMOKE_MINIO_ROOT_PASSWORD:-planisfy-local-minio-password}"
} >>"$SMOKE_ENV_FILE"

echo "Validating Docker Compose configuration"
compose config >/dev/null

echo "Preparing clean smoke-test stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true

echo "Checking seeded style fixtures"
style_fixture_dir="$(resolve_compose_path "$(env_value LOCAL_STORAGE_HOST_PATH)")/styles"
for style in \
  planisfy-streets-v1.json \
  planisfy-streets-light-v1.json \
  planisfy-streets-dark-v1.json
do
  if [[ ! -f "$style_fixture_dir/$style" ]]; then
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
compose_up minio minio-init postgres redis api

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

echo "Checking authorized setup preflight"
internal_secret="$(env_value INTERNAL_API_SECRET)"
if [[ -z "$internal_secret" ]]; then
  echo "INTERNAL_API_SECRET is required for setup preflight smoke" >&2
  exit 1
fi
preflight="$(curl -fsS -H "x-internal-secret: $internal_secret" http://localhost:4000/setup/preflight)"
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
detailed="$(curl -fsS -H "x-internal-secret: $internal_secret" http://localhost:4000/health/detailed)"
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

if [[ "${SMOKE_BROWSER_PRODUCT_LOOP:-false}" =~ ^(1|true|TRUE|yes|YES)$ ]]; then
  require_cmd pnpm
  echo "Running database migrations for browser product-loop smoke"
  (cd "$ROOT_DIR" && pnpm db:migrate)

  echo "Starting Console for browser product-loop smoke"
  compose_up console

  echo "Waiting for Console"
  for attempt in {1..90}; do
    if curl -fsS http://localhost:3001 >/dev/null; then
      break
    fi

    if [[ "$attempt" -eq 90 ]]; then
      echo "Console did not become reachable in time" >&2
      compose logs console >&2
      exit 1
    fi

    sleep 2
  done

  echo "Running seeded browser product-loop smoke"
  (
    cd "$ROOT_DIR"
    PLANISFY_E2E_CONSOLE_URL="${PLANISFY_E2E_CONSOLE_URL:-http://localhost:3001}" \
    PLANISFY_E2E_API_URL="${PLANISFY_E2E_API_URL:-http://localhost:4000}" \
    PLANISFY_E2E_ALLOW_MISSING_TILESET="${PLANISFY_E2E_ALLOW_MISSING_TILESET:-true}" \
      pnpm e2e:product-loop
  )
fi

echo "Docker Compose smoke test passed"
