#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
OUTPUT_ROOT="$ROOT_DIR/support-bundles"

usage() {
  cat <<USAGE
Usage: scripts/self-host-support-bundle.sh [--output DIR]

Creates a diagnostic support bundle with:
  - git and timestamp metadata
  - redacted environment key presence
  - Docker Compose rendered config
  - container status and recent logs
  - API health/detailed health/metrics when reachable

Options:
  --output DIR  Bundle directory to create. Defaults to support-bundles/planisfy-support-<timestamp>.
  -h, --help    Show this help text.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT_ROOT="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
  shift
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

write_or_note() {
  local path="$1"
  shift
  if "$@" > "$path" 2>&1; then
    return 0
  fi
  echo "Command failed: $*" > "$path"
}

redact_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ENV_FILE not found: $ENV_FILE"
    return
  fi

  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]]; then
      continue
    fi
    key="${line%%=*}"
    if [[ "$key" =~ (SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL) ]]; then
      echo "$key=<redacted>"
    else
      echo "$key=<set>"
    fi
  done < "$ENV_FILE"
}

require_cmd docker

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
bundle_dir="$OUTPUT_ROOT"
if [[ "$bundle_dir" == "$ROOT_DIR/support-bundles" ]]; then
  bundle_dir="$OUTPUT_ROOT/planisfy-support-$timestamp"
fi

mkdir -p "$bundle_dir"

git_sha="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
git_branch="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
cat > "$bundle_dir/manifest.json" <<MANIFEST
{
  "createdAt": "$timestamp",
  "gitSha": "$git_sha",
  "gitBranch": "$git_branch",
  "composeFile": "infra/docker/docker-compose.yml"
}
MANIFEST

redact_env > "$bundle_dir/env.redacted.txt"
write_or_note "$bundle_dir/compose.config.txt" compose config
write_or_note "$bundle_dir/compose.ps.txt" compose ps
write_or_note "$bundle_dir/compose.logs.txt" compose logs --no-color --tail=300

if command -v curl >/dev/null 2>&1; then
  write_or_note "$bundle_dir/api.health.json" curl -fsS http://localhost:4000/health
  write_or_note "$bundle_dir/api.health-detailed.json" curl -fsS http://localhost:4000/health/detailed
  write_or_note "$bundle_dir/api.metrics.txt" curl -fsS http://localhost:4000/metrics
else
  echo "curl not available" > "$bundle_dir/api.health.json"
fi

echo "Support bundle complete: $bundle_dir"
