#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"
INDEX_NAME="${PELIAS_INDEX_NAME:-pelias}"
ES_URL="${PELIAS_ELASTICSEARCH_URL:-http://localhost:9200}"
PELIAS_URL="${PELIAS_FIXTURE_API_URL:-http://localhost:3100}"

usage() {
  cat <<'USAGE'
Seed the local Pelias Elasticsearch index with the tracked Stuttgart CSV fixture.

Usage:
  scripts/pelias-dev-fixture.sh [--reset]

Options:
  --reset   Delete the local Pelias index before recreating and importing it.
USAGE
}

RESET=false
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env. Run scripts/self-host-setup.sh first." >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_elasticsearch() {
  for _ in {1..60}; do
    if curl -fsS "$ES_URL/_cluster/health?wait_for_status=yellow&timeout=1s" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for Pelias Elasticsearch at $ES_URL." >&2
  return 1
}

wait_for_pelias() {
  for _ in {1..60}; do
    if curl -fsS "$PELIAS_URL/v1" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for Pelias API at $PELIAS_URL." >&2
  return 1
}

index_exists() {
  curl -fsS -o /dev/null "$ES_URL/$INDEX_NAME"
}

cd "$ROOT_DIR"

echo "Starting Pelias Elasticsearch"
compose up -d pelias-elasticsearch
wait_for_elasticsearch

if [[ "$RESET" == true ]]; then
  echo "Deleting existing Pelias index '$INDEX_NAME'"
  curl -fsS -o /dev/null -X DELETE "$ES_URL/$INDEX_NAME" || true
fi

if index_exists; then
  echo "Pelias index '$INDEX_NAME' already exists; keeping schema. Use --reset to recreate it."
else
  echo "Creating Pelias index '$INDEX_NAME'"
  compose --profile pelias-fixture run --rm pelias-schema
fi

echo "Importing Stuttgart Pelias CSV fixture"
compose --profile pelias-fixture run --rm pelias-csv-importer

echo "Refreshing Pelias index"
curl -fsS -X POST "$ES_URL/$INDEX_NAME/_refresh" >/dev/null

echo "Starting Pelias API"
compose up -d pelias
wait_for_pelias

echo "Pelias fixture search check"
curl -fsS "$PELIAS_URL/v1/search?text=Schlossplatz&sources=planisfy_fixture" >/dev/null

echo "Seeded Pelias fixture data into '$INDEX_NAME'."
