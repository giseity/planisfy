#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dogfood-output/self-host-backup-restore}"
API_URL="${PLANISFY_E2E_API_URL:-http://localhost:4000}"
CONSOLE_URL="${PLANISFY_E2E_CONSOLE_URL:-http://localhost:3001}"
SUFFIX="${PLANISFY_E2E_RESOURCE_SUFFIX:-backup-restore-$(date -u +%Y%m%d%H%M%S)}"
SEED_HANDLE="${PLANISFY_SEED_HANDLE:-planisfy-demo}"
TILESET_HANDLE="smoke-tileset-${SUFFIX}"
STYLE_HANDLE="smoke-style-${SUFFIX}"
BACKUP_DIR="$OUTPUT_DIR/backup"
LOG_DIR="$OUTPUT_DIR/logs"
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
  ' "$ENV_FILE" | tail -n 1
}

storage_provider() {
  local provider
  provider="$(env_value STORAGE_PROVIDER)"
  echo "${provider:-local}"
}

compose_args() {
  local args=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
  if [[ "$(storage_provider)" == "s3" ]]; then
    args+=(--profile with-minio)
  fi
  printf '%s\n' "${args[@]}"
}

compose() {
  local args=()
  while IFS= read -r arg; do
    args+=("$arg")
  done < <(compose_args)
  docker compose "${args[@]}" "$@"
}

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    mkdir -p "$LOG_DIR"
    compose logs --no-color postgres redis martin minio minio-init pelias pelias-elasticsearch elevation api console worker-geodata >"$LOG_DIR/compose.log" 2>&1 || true
  fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true
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

require_cmd curl
require_cmd docker
require_cmd node
require_cmd pnpm

trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"
rm -rf "$BACKUP_DIR"

"$ROOT_DIR/scripts/self-host-setup.sh"

set -a
# shellcheck disable=SC1090
source <(sed 's/\r$//' "$ENV_FILE")
set +a

echo "Preparing clean self-host stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true
if [[ "$(storage_provider)" == "s3" ]]; then
  compose up -d postgres redis martin minio minio-init
else
  compose up -d postgres redis martin
fi

echo "Running database migrations"
(cd "$ROOT_DIR" && pnpm db:migrate)

compose up -d api console worker-geodata

wait_for_http "$API_URL/health" "API"
wait_for_http "$CONSOLE_URL" "Console"

echo "Creating published product-loop data"
(
  cd "$ROOT_DIR"
  PLANISFY_E2E_API_URL="$API_URL" \
  PLANISFY_E2E_CONSOLE_URL="$CONSOLE_URL" \
  PLANISFY_E2E_RESOURCE_SUFFIX="$SUFFIX" \
    pnpm e2e:product-loop:full
)

STYLE_URL="$API_URL/styles/v1/${SEED_HANDLE}/${STYLE_HANDLE}"
TILEJSON_URL="$API_URL/tiles/v1/${SEED_HANDLE}.${TILESET_HANDLE}.json"

echo "Running self-host backup"
ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/self-host-backup.sh" --output "$BACKUP_DIR"

echo "Restoring into fresh Compose volumes"
compose down -v --remove-orphans >/dev/null 2>&1 || true
ENV_FILE="$ENV_FILE" "$ROOT_DIR/scripts/self-host-restore.sh" --backup "$BACKUP_DIR" --confirm
if [[ "$(storage_provider)" == "s3" ]]; then
  compose up -d minio minio-init api
else
  compose up -d api
fi

wait_for_http "$API_URL/health" "Restored API"

secret="$(env_value INTERNAL_API_SECRET)"
if [[ -z "$secret" ]]; then
  echo "INTERNAL_API_SECRET is missing from $ENV_FILE" >&2
  exit 1
fi

echo "Checking authorized setup preflight"
curl -fsS -H "x-internal-secret: $secret" "$API_URL/setup/preflight" >/dev/null

echo "Checking restored public style"
curl -fsS "$STYLE_URL" >/dev/null

echo "Checking restored TileJSON"
tilejson="$(curl -fsS "$TILEJSON_URL")"
TILEJSON="$tilejson" node <<'NODE'
const body = JSON.parse(process.env.TILEJSON ?? "{}");
if (!Array.isArray(body.tiles) || body.tiles.length === 0) {
  console.error("Restored TileJSON does not expose tile URL templates");
  process.exit(1);
}
if (!Array.isArray(body.vector_layers) || body.vector_layers.length === 0) {
  console.error("Restored TileJSON does not expose vector layer metadata");
  process.exit(1);
}
NODE

echo "Self-host backup/restore smoke passed"
echo "styleUrl=$STYLE_URL"
echo "tilejsonUrl=$TILEJSON_URL"
