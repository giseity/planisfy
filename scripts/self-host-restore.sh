#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
DATA_DIR="$ROOT_DIR/infra/docker/data"
BACKUP_DIR=""
CONFIRM=false

usage() {
  cat <<USAGE
Usage: scripts/self-host-restore.sh --backup DIR --confirm

Restores a self-host backup created by scripts/self-host-backup.sh.

This overwrites PostgreSQL data and local data directories present in the
backup. The script refuses to run unless --confirm is provided.

Options:
  --backup DIR  Backup directory containing postgres.dump and optional archives.
  --confirm     Required destructive-operation confirmation.
  -h, --help    Show this help text.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup)
      BACKUP_DIR="$2"
      shift
      ;;
    --confirm)
      CONFIRM=true
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

if [[ -z "$BACKUP_DIR" ]]; then
  echo "--backup DIR is required" >&2
  usage
  exit 2
fi

if [[ "$CONFIRM" != true ]]; then
  echo "Restore is destructive. Rerun with --confirm when ready." >&2
  exit 2
fi

if [[ ! -f "$BACKUP_DIR/postgres.dump" ]]; then
  echo "Backup is missing postgres.dump: $BACKUP_DIR" >&2
  exit 1
fi

require_cmd docker
require_cmd tar

echo "Starting database and Redis services"
compose up -d postgres redis

echo "Restoring PostgreSQL"
compose exec -T postgres pg_restore --clean --if-exists -U planisfy -d planisfy < "$BACKUP_DIR/postgres.dump"

if [[ -f "$BACKUP_DIR/redis.dump.rdb" ]]; then
  echo "Restoring Redis dump"
  compose stop redis >/dev/null
  compose cp "$BACKUP_DIR/redis.dump.rdb" redis:/data/dump.rdb >/dev/null
  compose up -d redis
fi

restore_archive() {
  local name="$1"
  local archive="$BACKUP_DIR/$name.tgz"
  if [[ -f "$archive" ]]; then
    echo "Restoring infra/docker/data/$name"
    rm -rf "$DATA_DIR/$name"
    mkdir -p "$DATA_DIR"
    tar -xzf "$archive" -C "$DATA_DIR"
  fi
}

restore_archive storage
restore_archive pmtiles
restore_archive valhalla_data

echo "Restore complete. Restart the full stack when ready:"
echo "  docker compose --env-file .env -f infra/docker/docker-compose.yml up -d"
