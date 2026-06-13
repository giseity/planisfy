#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/infra/pelias/metro"
ENV_FILE="$PROJECT_DIR/.env"
CACHE_DIR="$PROJECT_DIR/.cache"
PELIAS_DOCKER_DIR="$CACHE_DIR/pelias-docker"
PELIAS_DOCKER_REPO="${PELIAS_DOCKER_REPO:-https://github.com/pelias/docker.git}"
PELIAS_DOCKER_REF="${PELIAS_DOCKER_REF:-3dfa07d580416edd7a27c2d4ff5976c8c1cc6ebc}"

usage() {
  cat <<'USAGE'
Run the production-like official Pelias metro project.

Usage:
  scripts/pelias-metro.sh <command>

Commands:
  bootstrap            Create .env, data dirs, and clone pinned pelias/docker.
  pull                 Pull pinned Pelias service images.
  elastic-start        Start Elasticsearch and wait for yellow health.
  create-index         Create the Pelias Elasticsearch index.
  build-core           Download/prepare/import core metro data, no interpolation.
  build-interpolation  Download and build interpolation data, then import it.
  up                   Start API, libpostal, placeholder, pip, interpolation, ES.
  restart              Restart serving services.
  status               Show Compose service status.
  logs                 Tail Compose logs.
  down                 Stop the metro stack.
  test                 Run Pelias fuzzy tests if test cases are present.

The default project is the official Portland metro starter dataset. It is the
smallest production-like Pelias path that exercises real importers and services.
USAGE
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
  fi
}

ensure_data_dirs() {
  mkdir -p \
    "$PROJECT_DIR/data" \
    "$PROJECT_DIR/data/elasticsearch" \
    "$PROJECT_DIR/data/blacklist" \
    "$CACHE_DIR"
}

ensure_pelias_docker() {
  mkdir -p "$CACHE_DIR"
  if [[ ! -d "$PELIAS_DOCKER_DIR/.git" ]]; then
    git clone "$PELIAS_DOCKER_REPO" "$PELIAS_DOCKER_DIR"
  fi

  git -C "$PELIAS_DOCKER_DIR" fetch --quiet origin "$PELIAS_DOCKER_REF"
  git -C "$PELIAS_DOCKER_DIR" checkout --quiet "$PELIAS_DOCKER_REF"
}

pelias() {
  ensure_env
  ensure_data_dirs
  ensure_pelias_docker
  (cd "$PROJECT_DIR" && "$PELIAS_DOCKER_DIR/pelias" "$@")
}

bootstrap() {
  ensure_env
  ensure_data_dirs
  ensure_pelias_docker
  echo "Bootstrapped official Pelias metro project at $PROJECT_DIR"
  echo "Review $ENV_FILE before the first import if your Docker UID/GID differs."
}

build_core() {
  pelias elastic start
  pelias elastic wait
  pelias elastic create
  pelias download wof
  pelias download oa
  pelias download osm
  pelias download transit
  pelias download csv
  pelias prepare placeholder
  pelias prepare polylines
  pelias import wof
  pelias import oa
  pelias import osm
  pelias import polylines
  pelias import transit
  pelias import csv
  pelias elastic stats
}

build_interpolation() {
  pelias download tiger
  pelias prepare interpolation
}

case "${1:-}" in
  -h|--help|"")
    usage
    ;;
  bootstrap)
    bootstrap
    ;;
  pull)
    pelias compose pull
    ;;
  elastic-start)
    pelias elastic start
    pelias elastic wait
    ;;
  create-index)
    pelias elastic create
    ;;
  build-core)
    build_core
    ;;
  build-interpolation)
    build_interpolation
    ;;
  up)
    pelias compose up -d elasticsearch libpostal placeholder pip interpolation api
    ;;
  restart)
    pelias compose kill api placeholder pip interpolation libpostal
    pelias compose up -d elasticsearch libpostal placeholder pip interpolation api
    ;;
  status)
    pelias compose ps
    ;;
  logs)
    pelias compose logs -f "${@:2}"
    ;;
  down)
    pelias compose down
    ;;
  test)
    pelias test run
    ;;
  *)
    echo "Unknown command: $1" >&2
    usage >&2
    exit 2
    ;;
esac
