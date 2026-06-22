#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
DATA_DIR="$ROOT_DIR/infra/docker/data"
BACKUP_DIR=""
CONFIRM=false
export COMPOSE_ANSI=never
export COMPOSE_PROGRESS=plain

usage() {
  cat <<USAGE
Usage: scripts/self-host-restore.sh --backup DIR --confirm

Restores a self-host backup created by scripts/self-host-backup.sh.

This overwrites PostgreSQL data and local/MinIO data directories present in the
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

compose_with_minio() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile with-minio "$@"
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

wait_for_postgres() {
  for attempt in {1..60}; do
    if compose exec -T postgres pg_isready -U planisfy -d planisfy >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready for restore" >&2
  return 1
}

remove_data_dir() {
  local name="$1"
  local path="$DATA_DIR/$name"
  if [[ ! -e "$path" ]]; then
    return 0
  fi
  if rm -rf "$path" 2>/dev/null; then
    return 0
  fi

  if [[ "$name" == "minio" ]]; then
    echo "Removing container-owned infra/docker/data/$name via Compose helper"
    compose_with_minio run --rm --no-deps --entrypoint sh minio \
      -c "rm -rf /data/* /data/.[!.]* /data/..?*"
    if [[ -d "$path" ]] && ! find "$path" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
      return 0
    fi
  fi

  echo "Removing container-owned infra/docker/data/$name via Docker helper"
  docker run --rm \
    -v "$path:/target" \
    --entrypoint sh \
    node:24-slim \
    -c "chmod -R u+rwX /target 2>/dev/null || true; find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +"
  for _attempt in {1..20}; do
    if [[ ! -e "$path" ]]; then
      return 0
    fi
    if [[ -d "$path" ]] && ! find "$path" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
      return 0
    fi
    rm -rf "$path" 2>/dev/null || true
    sleep 0.25
  done
  if [[ -e "$path" ]] && { [[ ! -d "$path" ]] || find "$path" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; }; then
    echo "Could not remove infra/docker/data/$name" >&2
    return 1
  fi
}

echo "Starting database and Redis services"
compose up -d postgres redis
wait_for_postgres

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
    if ! remove_data_dir "$name"; then
      if [[ "$name" == "valhalla_data" ]]; then
        echo "Skipping valhalla_data restore because existing container-owned files could not be replaced" >&2
        return 0
      fi
      return 1
    fi
    mkdir -p "$DATA_DIR"
    tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$DATA_DIR"
  fi
}

restore_archive storage
restore_archive minio
restore_archive pmtiles
restore_archive valhalla_data

echo "Restore complete. Restart the full stack when ready:"
echo "  docker compose --env-file .env -f infra/docker/docker-compose.yml up -d"
