#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
DATA_DIR="$ROOT_DIR/infra/docker/data"
STYLE_FIXTURE="$ROOT_DIR/packages/map-styles/styles/planisfy-streets-v1.json"
STORAGE_STYLE_DIR="$DATA_DIR/storage/styles"
DEMO_PMTILES="$DATA_DIR/pmtiles/stuttgart.pmtiles"

usage() {
  cat <<USAGE
Usage: scripts/self-host-setup.sh [--up] [--migrate] [--pull]

Prepares a local self-host demo environment by creating .env, local storage
folders, and demo fixtures used by Docker Compose.

Options:
  --up       Start the Docker Compose stack after preparing files.
  --migrate  Run Drizzle migrations after starting dependencies.
  --pull     Pull service images before starting the stack.
  -h, --help Show this help text.
USAGE
}

want_up=false
want_migrate=false
want_pull=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --up) want_up=true ;;
    --migrate) want_migrate=true ;;
    --pull) want_pull=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
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

require_cmd docker

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    echo "Cannot find $ENV_EXAMPLE" >&2
    exit 1
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

mkdir -p \
  "$DATA_DIR/pmtiles" \
  "$DATA_DIR/valhalla_data" \
  "$DATA_DIR/storage/uploads" \
  "$DATA_DIR/storage/styles" \
  "$DATA_DIR/storage/fixtures"

if [[ -f "$STYLE_FIXTURE" ]]; then
  cp "$STYLE_FIXTURE" "$STORAGE_STYLE_DIR/planisfy-streets-v1.json"
  echo "Seeded local storage style fixture: infra/docker/data/storage/styles/planisfy-streets-v1.json"
fi

if [[ -f "$DEMO_PMTILES" ]]; then
  echo "Found demo PMTiles fixture: infra/docker/data/pmtiles/stuttgart.pmtiles"
else
  cat <<'PMTILES_WARNING'
Demo PMTiles fixture is missing: infra/docker/data/pmtiles/stuttgart.pmtiles

The stack can still start, but the default Planisfy Streets map will not render
tiles until a compatible PMTiles file is placed at that path. Keep downloaded
map data out of Git.
PMTILES_WARNING
fi

cat > "$DATA_DIR/storage/fixtures/README.md" <<'FIXTURE_README'
# Local demo storage fixtures

This directory is intentionally small and git-friendly. Runtime uploads and
published style objects can be mounted here by Docker Compose when
`STORAGE_PROVIDER=local`.
FIXTURE_README

echo "Validating Docker Compose configuration"
compose config >/dev/null

if [[ "$want_pull" == true ]]; then
  compose pull
fi

if [[ "$want_up" == true || "$want_migrate" == true ]]; then
  compose up -d postgres redis martin valhalla
  if [[ "$want_up" == true ]]; then
    compose up -d
  fi
fi

if [[ "$want_migrate" == true ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && pnpm -F @planisfy/database db:migrate)
  else
    echo "pnpm is required for --migrate" >&2
    exit 1
  fi
fi

cat <<NEXT

Self-host demo prep complete.

Next steps:
  docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
  pnpm -F @planisfy/database db:migrate
  curl http://localhost:4000/health
  curl http://localhost:4000/health/detailed

Demo data directories:
  infra/docker/data/pmtiles        Put *.pmtiles files here for Martin.
                                   The default fixture expects stuttgart.pmtiles.
  infra/docker/data/valhalla_data  Put Valhalla tiles/config data here.
  infra/docker/data/storage        Local object storage mount.
NEXT
