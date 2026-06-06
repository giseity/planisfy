#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.example}"

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

trap cleanup EXIT

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
