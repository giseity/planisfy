#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
MARTIN_CONFIG="$ROOT_DIR/infra/docker/configs/martin.yaml"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
DATA_DIR="$ROOT_DIR/infra/docker/data"
STYLE_FIXTURE="$ROOT_DIR/packages/map-styles/styles/planisfy-streets-v1.json"
SOURCE_LAYER_CONTRACT="$ROOT_DIR/packages/map-styles/source-layer-contract.json"
STORAGE_DIR="$DATA_DIR/storage"
STORAGE_STYLE_DIR="$DATA_DIR/storage/styles"
STORAGE_MARTIN_SOURCES_DIR="$DATA_DIR/storage/martin-sources"
DEMO_PMTILES="$DATA_DIR/pmtiles/stuttgart.pmtiles"
FIXTURE_TILEJSON_URL="http://localhost:3005/planisfy.basic"
FIXTURE_MARTIN_SOURCE="stuttgart-base"
FIXTURE_COMPOSER_ID="planisfy.basic"

usage() {
  cat <<USAGE
Usage: scripts/self-host-setup.sh [--demo-data] [--up] [--migrate] [--pull]

Prepares a local self-host demo environment by creating .env, local storage
folders, and demo fixtures used by Docker Compose.

Options:
  --demo-data Download the configured demo PMTiles fixture when missing.
  --up       Start the Docker Compose stack after preparing files.
  --migrate  Run Drizzle migrations after starting dependencies.
  --pull     Pull service images before starting the stack.
  -h, --help Show this help text.
USAGE
}

want_up=false
want_migrate=false
want_pull=false
want_demo_data=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo-data) want_demo_data=true ;;
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

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

require_text() {
  local file="$1"
  local expected="$2"
  local label="$3"
  if ! grep -Fq "$expected" "$file"; then
    cat <<CHECK_ERROR >&2
Demo wiring check failed: $label
  file: $file
  expected text: $expected
CHECK_ERROR
    exit 1
  fi
}

check_demo_wiring() {
  require_file "$STYLE_FIXTURE"
  require_file "$SOURCE_LAYER_CONTRACT"
  require_file "$MARTIN_CONFIG"

  require_text "$STYLE_FIXTURE" "\"url\": \"$FIXTURE_TILEJSON_URL\"" \
    "Planisfy Streets fixture style must point at the local Martin fixture TileJSON URL."
  require_text "$SOURCE_LAYER_CONTRACT" "\"tileset\": \"$FIXTURE_COMPOSER_ID\"" \
    "Source-layer contract must name the same fixture tileset that Martin composes."
  require_text "$SOURCE_LAYER_CONTRACT" "\"sourceId\": \"planisfy-streets\"" \
    "Source-layer contract must match the style source id."
  require_text "$MARTIN_CONFIG" "$FIXTURE_MARTIN_SOURCE: \"/data/stuttgart.pmtiles\"" \
    "Martin config must mount the expected Stuttgart PMTiles fixture source."
  require_text "$MARTIN_CONFIG" "id: \"$FIXTURE_COMPOSER_ID\"" \
    "Martin config must expose the stable Planisfy fixture tileset."
  require_text "$MARTIN_CONFIG" "id: \"$FIXTURE_COMPOSER_ID.v1\"" \
    "Martin config must expose the immutable Planisfy fixture tileset alias."
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

load_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

download_demo_pmtiles() {
  local url="${DEMO_PMTILES_URL:-}"
  local checksum="${DEMO_PMTILES_SHA256:-}"
  local target="$DEMO_PMTILES"
  local tmp="${target}.tmp"

  if [[ -z "$url" ]]; then
    cat <<'NO_URL' >&2
DEMO_PMTILES_URL is not configured.

Set DEMO_PMTILES_URL in .env, then rerun:
  scripts/self-host-setup.sh --demo-data
NO_URL
    exit 1
  fi

  require_cmd curl
  echo "Downloading demo PMTiles fixture"
  curl -fL --retry 3 --retry-delay 2 --output "$tmp" "$url"
  validate_pmtiles "$tmp"

  if [[ -n "$checksum" ]]; then
    require_cmd sha256sum
    echo "${checksum}  ${tmp}" | sha256sum -c -
  fi

  mv "$tmp" "$target"
  echo "Downloaded demo PMTiles fixture: infra/docker/data/pmtiles/stuttgart.pmtiles"
}

validate_pmtiles() {
  local path="$1"
  local magic
  magic="$(head -c 7 "$path" || true)"
  if [[ "$magic" != "PMTiles" ]]; then
    rm -f "$path"
    echo "Downloaded file is not a PMTiles archive: $path" >&2
    exit 1
  fi
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
load_env_file

mkdir -p \
  "$DATA_DIR/pmtiles" \
  "$DATA_DIR/valhalla_data" \
  "$DATA_DIR/storage/uploads" \
  "$DATA_DIR/storage/styles" \
  "$DATA_DIR/storage/fixtures" \
  "$STORAGE_MARTIN_SOURCES_DIR"

if [[ ! -w "$STORAGE_DIR" ]]; then
  echo "Local storage directory is not writable: infra/docker/data/storage" >&2
  exit 1
fi

check_demo_wiring

if [[ -f "$STYLE_FIXTURE" ]]; then
  cp "$STYLE_FIXTURE" "$STORAGE_STYLE_DIR/planisfy-streets-v1.json"
  echo "Seeded local storage style fixture: infra/docker/data/storage/styles/planisfy-streets-v1.json"
fi

if [[ ! -f "$DEMO_PMTILES" && "$want_demo_data" == true ]]; then
  download_demo_pmtiles
fi

if [[ -f "$DEMO_PMTILES" ]]; then
  validate_pmtiles "$DEMO_PMTILES"
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
  visit http://localhost:3001/sign-up
  curl http://localhost:4000/health
  curl http://localhost:4000/health/detailed

Demo data directories:
  infra/docker/data/pmtiles        Put *.pmtiles files here for Martin.
                                   The default fixture expects stuttgart.pmtiles.
                                   Use --demo-data with DEMO_PMTILES_URL to fetch it.
  infra/docker/data/valhalla_data  Put Valhalla tiles/config data here.
  infra/docker/data/storage        Local object storage mount.
  infra/docker/data/storage/martin-sources
                                   Published local tileset aliases for Martin.

First account:
  After migrations complete, create the first local user at:
    http://localhost:3001/sign-up
  Email delivery is optional for the local demo; unverified users can still use
  the Console, with a verification reminder banner.
NEXT
