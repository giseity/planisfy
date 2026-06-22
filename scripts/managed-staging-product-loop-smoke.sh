#!/usr/bin/env bash
set -euo pipefail

API_URL="${MANAGED_STAGING_API_URL:-${PLANISFY_E2E_API_URL:-}}"
CONSOLE_URL="${MANAGED_STAGING_CONSOLE_URL:-${PLANISFY_E2E_CONSOLE_URL:-}}"
TEST_EMAIL="${MANAGED_STAGING_TEST_EMAIL:-${PLANISFY_SEED_EMAIL:-}}"
TEST_PASSWORD="${MANAGED_STAGING_TEST_PASSWORD:-${PLANISFY_SEED_PASSWORD:-}}"
RESOURCE_SUFFIX="${PLANISFY_E2E_RESOURCE_SUFFIX:-managed-staging-$(date -u +%Y%m%d%H%M%S)}"

require_env_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "$name is required" >&2
    exit 1
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_public_https_url() {
  local name="$1"
  local value="$2"
  NAME="$name" VALUE="$value" node <<'NODE'
const name = process.env.NAME;
const value = process.env.VALUE;
const url = new URL(value);
if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_MANAGED_STAGING !== "true") {
  throw new Error(`${name} must use https for managed staging`);
}
if (
  process.env.ALLOW_LOCAL_MANAGED_SMOKE !== "true" &&
  (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost"))
) {
  throw new Error(`${name} must be a public staging ingress URL, not ${url.hostname}`);
}
NODE
}

require_cmd node
require_cmd pnpm
require_env_value MANAGED_STAGING_API_URL "$API_URL"
require_env_value MANAGED_STAGING_CONSOLE_URL "$CONSOLE_URL"
require_env_value MANAGED_STAGING_TEST_EMAIL "$TEST_EMAIL"
require_env_value MANAGED_STAGING_TEST_PASSWORD "$TEST_PASSWORD"
require_public_https_url MANAGED_STAGING_API_URL "$API_URL"
require_public_https_url MANAGED_STAGING_CONSOLE_URL "$CONSOLE_URL"

PLANISFY_E2E_API_URL="${API_URL%/}" \
PLANISFY_E2E_CONSOLE_URL="${CONSOLE_URL%/}" \
PLANISFY_SEED_EMAIL="$TEST_EMAIL" \
PLANISFY_SEED_PASSWORD="$TEST_PASSWORD" \
PLANISFY_E2E_RESOURCE_SUFFIX="$RESOURCE_SUFFIX" \
PLANISFY_E2E_SKIP_SEED=true \
  pnpm e2e:product-loop:full
