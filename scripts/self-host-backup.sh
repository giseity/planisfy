#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
DATA_DIR="$ROOT_DIR/infra/docker/data"
OUTPUT_ROOT="$ROOT_DIR/backups"

usage() {
  cat <<USAGE
Usage: scripts/self-host-backup.sh [--output DIR]

Creates a self-host backup containing:
  - PostgreSQL custom-format dump
  - Redis dump.rdb when Redis is running
  - local storage, PMTiles, and Valhalla data archives
  - manifest metadata

Options:
  --output DIR  Backup directory to create. Defaults to backups/planisfy-<timestamp>.
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

require_cmd docker
require_cmd tar

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$OUTPUT_ROOT"
if [[ "$backup_dir" == "$ROOT_DIR/backups" ]]; then
  backup_dir="$OUTPUT_ROOT/planisfy-$timestamp"
fi

mkdir -p "$backup_dir"

echo "Writing PostgreSQL backup"
compose exec -T postgres pg_dump -U planisfy -d planisfy --format=custom > "$backup_dir/postgres.dump"

if compose exec -T redis redis-cli ping >/dev/null 2>&1; then
  echo "Writing Redis backup"
  compose exec -T redis redis-cli SAVE >/dev/null
  docker cp planisfy-redis:/data/dump.rdb "$backup_dir/redis.dump.rdb" >/dev/null
else
  echo "Redis is not reachable; skipping Redis dump" >&2
fi

archive_dir() {
  local name="$1"
  local path="$DATA_DIR/$name"
  if [[ -d "$path" ]]; then
    echo "Archiving infra/docker/data/$name"
    tar -czf "$backup_dir/$name.tgz" -C "$DATA_DIR" "$name"
  fi
}

archive_dir storage
archive_dir pmtiles
archive_dir valhalla_data

git_sha="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
cat > "$backup_dir/manifest.json" <<MANIFEST
{
  "createdAt": "$timestamp",
  "gitSha": "$git_sha",
  "composeFile": "infra/docker/docker-compose.yml",
  "includes": {
    "postgres": true,
    "redis": $(if [[ -f "$backup_dir/redis.dump.rdb" ]]; then echo true; else echo false; fi),
    "storage": $(if [[ -f "$backup_dir/storage.tgz" ]]; then echo true; else echo false; fi),
    "pmtiles": $(if [[ -f "$backup_dir/pmtiles.tgz" ]]; then echo true; else echo false; fi),
    "valhallaData": $(if [[ -f "$backup_dir/valhalla_data.tgz" ]]; then echo true; else echo false; fi)
  }
}
MANIFEST

echo "Backup complete: $backup_dir"
