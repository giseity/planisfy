#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
BASE_ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
MANAGED_LOCAL_ENV_FILE="${MANAGED_LOCAL_ENV_FILE:-$ROOT_DIR/.env.managed-local}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dogfood-output/managed-local-smoke}"
LOG_DIR="$OUTPUT_DIR/logs"
SMOKE_ENV_FILE=""
export COMPOSE_ANSI=never
export COMPOSE_PROGRESS=plain

usage() {
  cat <<USAGE
Usage: scripts/managed-local-smoke.sh

Runs managed-mode smoke checks against the local Docker Compose stack while
using real Cloudflare R2 object storage.

Required in shell env or .env.managed-local:
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY

Optional:
  R2_ACCOUNT_ID              Default: discovered from wrangler whoami
  R2_BUCKET                 Default: planisfy-managed-local-smoke
  R2_PUBLIC_URL             Optional public URL override; not required here
  MANAGED_LOCAL_KEEP_STACK  Set true to leave Compose running after the smoke
  MANAGED_LOCAL_FORCE_REBUILD Set true to rebuild/recreate app images
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_truthy() {
  [[ "${1:-}" =~ ^(1|true|TRUE|yes|YES)$ ]]
}

load_env_files() {
  if [[ -f "$BASE_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(sed 's/\r$//' "$BASE_ENV_FILE")
    set +a
  fi

  if [[ -f "$MANAGED_LOCAL_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(sed 's/\r$//' "$MANAGED_LOCAL_ENV_FILE")
    set +a
  fi
}

nonempty() {
  local value="${1:-}"
  [[ -n "$value" ]]
}

require_env() {
  local missing=()
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("$name")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    cat <<MISSING_ENV >&2
Managed-local smoke is missing required R2 credential env vars:
  ${missing[*]}

Create $MANAGED_LOCAL_ENV_FILE with:
  R2_ACCESS_KEY_ID="..."
  R2_SECRET_ACCESS_KEY="..."

Use a Cloudflare R2 S3 API token scoped to the managed-local smoke bucket.
R2_ACCOUNT_ID is discovered from Wrangler when omitted.
MISSING_ENV
    exit 1
  fi
}

discover_r2_account_id() {
  if [[ -n "${R2_ACCOUNT_ID:-}" ]]; then
    return
  fi

  local output
  output="$(wrangler whoami 2>&1)"
  R2_ACCOUNT_ID="$(grep -Eo '[a-f0-9]{32}' <<<"$output" | tail -n 1)"
  if [[ -z "$R2_ACCOUNT_ID" ]]; then
    cat <<ACCOUNT_ID_ERROR >&2
Could not discover R2_ACCOUNT_ID from Wrangler.

Set R2_ACCOUNT_ID in $MANAGED_LOCAL_ENV_FILE, then rerun:
  pnpm smoke:managed-local

Wrangler output:
$output
ACCOUNT_ID_ERROR
    exit 1
  fi
  export R2_ACCOUNT_ID
  echo "Discovered R2_ACCOUNT_ID from Wrangler: $R2_ACCOUNT_ID"
}

env_quote() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

write_env() {
  local name="$1"
  local value="$2"
  printf '%s=%s\n' "$name" "$(env_quote "$value")" >>"$SMOKE_ENV_FILE"
}

compose() {
  docker compose --env-file "$SMOKE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose_up() {
  local args=(-d)
  if is_truthy "${MANAGED_LOCAL_FORCE_REBUILD:-false}"; then
    args+=(--build --force-recreate)
  fi
  compose up "${args[@]}" "$@"
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

cleanup() {
  local status=$?
  if [[ -n "$SMOKE_ENV_FILE" && "$status" -ne 0 ]]; then
    mkdir -p "$LOG_DIR"
    compose logs --no-color postgres redis martin valhalla pelias pelias-elasticsearch elevation api console >"$LOG_DIR/compose.log" 2>&1 || true
  fi

  if [[ -n "$SMOKE_ENV_FILE" ]] && ! is_truthy "${MANAGED_LOCAL_KEEP_STACK:-false}"; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi

  if [[ -n "$SMOKE_ENV_FILE" && -f "$SMOKE_ENV_FILE" ]]; then
    rm -f "$SMOKE_ENV_FILE"
  fi
}

ensure_r2_bucket() {
  local bucket="$1"
  if ! wrangler r2 bucket info "$bucket" >/dev/null 2>&1; then
    wrangler r2 bucket create "$bucket"
  fi
}

write_smoke_env() {
  local r2_bucket="${R2_BUCKET:-planisfy-managed-local-smoke}"
  local r2_endpoint="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  local r2_public_url="${R2_PUBLIC_URL:-}"

  SMOKE_ENV_FILE="$(mktemp)"
  local override_re='^(DEPLOYMENT_MODE|STORAGE_PROVIDER|R2_ACCOUNT_ID|R2_BUCKET|R2_ENDPOINT|R2_PUBLIC_URL|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|DODO_PAYMENTS_API_KEY|DODO_PAYMENTS_ENVIRONMENT|DODO_PAYMENTS_WEBHOOK_SECRET|DODO_STARTER_MONTHLY_PRODUCT_ID|DODO_STARTER_YEARLY_PRODUCT_ID|DODO_SCALE_MONTHLY_PRODUCT_ID|DODO_SCALE_YEARLY_PRODUCT_ID|ZEPTOMAIL_SEND_MAIL_TOKEN|ZEPTOMAIL_FROM_AUTH|ZEPTOMAIL_FROM_NOTIFICATIONS|LOCAL_STORAGE_HOST_PATH)='
  if [[ -f "$BASE_ENV_FILE" ]]; then
    grep -Ev "$override_re" "$BASE_ENV_FILE" >"$SMOKE_ENV_FILE" || true
  fi
  if [[ -f "$MANAGED_LOCAL_ENV_FILE" ]]; then
    grep -Ev "$override_re" "$MANAGED_LOCAL_ENV_FILE" >>"$SMOKE_ENV_FILE" || true
  fi

  write_env DEPLOYMENT_MODE managed
  write_env STORAGE_PROVIDER r2
  write_env R2_ACCOUNT_ID "$R2_ACCOUNT_ID"
  write_env R2_BUCKET "$r2_bucket"
  write_env R2_ENDPOINT "$r2_endpoint"
  write_env R2_PUBLIC_URL "$r2_public_url"
  write_env R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID"
  write_env R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY"
  write_env AWS_ACCESS_KEY_ID ""
  write_env AWS_SECRET_ACCESS_KEY ""
  write_env DODO_PAYMENTS_API_KEY "${DODO_PAYMENTS_API_KEY:-managed-local-dodo-key}"
  write_env DODO_PAYMENTS_ENVIRONMENT "${DODO_PAYMENTS_ENVIRONMENT:-test_mode}"
  write_env DODO_PAYMENTS_WEBHOOK_SECRET "${DODO_PAYMENTS_WEBHOOK_SECRET:-managed-local-webhook-secret}"
  write_env DODO_STARTER_MONTHLY_PRODUCT_ID "${DODO_STARTER_MONTHLY_PRODUCT_ID:-managed-local-starter-monthly-product}"
  write_env DODO_STARTER_YEARLY_PRODUCT_ID "${DODO_STARTER_YEARLY_PRODUCT_ID:-managed-local-starter-yearly-product}"
  write_env DODO_SCALE_MONTHLY_PRODUCT_ID "${DODO_SCALE_MONTHLY_PRODUCT_ID:-managed-local-scale-monthly-product}"
  write_env DODO_SCALE_YEARLY_PRODUCT_ID "${DODO_SCALE_YEARLY_PRODUCT_ID:-managed-local-scale-yearly-product}"
  write_env ZEPTOMAIL_SEND_MAIL_TOKEN "${ZEPTOMAIL_SEND_MAIL_TOKEN:-managed-local-zeptomail-token}"
  write_env ZEPTOMAIL_FROM_AUTH "${ZEPTOMAIL_FROM_AUTH:-auth@example.test}"
  write_env ZEPTOMAIL_FROM_NOTIFICATIONS "${ZEPTOMAIL_FROM_NOTIFICATIONS:-notifications@example.test}"
  write_env LOCAL_STORAGE_HOST_PATH "${LOCAL_STORAGE_HOST_PATH:-../../.storage}"
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage
    exit 2
    ;;
esac

require_cmd curl
require_cmd docker
require_cmd node
require_cmd pnpm
require_cmd wrangler

load_env_files
discover_r2_account_id
require_env R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

R2_BUCKET="${R2_BUCKET:-planisfy-managed-local-smoke}"
mkdir -p "$OUTPUT_DIR"

echo "Ensuring Cloudflare R2 bucket: $R2_BUCKET"
ensure_r2_bucket "$R2_BUCKET"
write_smoke_env

trap cleanup EXIT

echo "Preparing managed-local demo data"
ENV_FILE="$SMOKE_ENV_FILE" "$ROOT_DIR/scripts/self-host-setup.sh" --demo-data

echo "Validating Docker Compose configuration"
compose config >/dev/null

echo "Preparing clean managed-local stack"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose_up postgres redis martin valhalla

echo "Running database migrations"
set -a
# shellcheck disable=SC1090
source <(sed 's/\r$//' "$SMOKE_ENV_FILE")
set +a
(cd "$ROOT_DIR" && pnpm db:migrate)

echo "Starting API and Console in managed mode"
compose_up api console

wait_for_http "http://localhost:4000/health" "API"
wait_for_http "http://localhost:3001" "Console"

echo "Running managed smoke against local ingress"
(
  cd "$ROOT_DIR"
  MANAGED_STAGING_API_URL=http://localhost:4000 \
  MANAGED_STAGING_CONSOLE_URL=http://localhost:3001 \
  INTERNAL_API_SECRET="$INTERNAL_API_SECRET" \
  ALLOW_INSECURE_MANAGED_STAGING=true \
  ALLOW_LOCAL_MANAGED_SMOKE=true \
    node scripts/managed-staging-smoke.mjs
)

echo "Managed-local smoke passed"
