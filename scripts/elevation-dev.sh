#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELEVATION_DIR="$ROOT_DIR/infra/docker/data/elevation"
SRTM_TILE_NAME="${SRTM_TILE_NAME:-N45W123}"
SRTM_TILE_URL="${SRTM_TILE_URL:-https://s3.amazonaws.com/elevation-tiles-prod/skadi/N45/N45W123.hgt.gz}"

usage() {
  cat <<'USAGE'
Prepare local SRTM elevation data for the dev elevation service.

Usage:
  scripts/elevation-dev.sh download-portland

The default fixture downloads SRTM HGT tile N45W123, which covers Portland and
the official Pelias metro dev region.
USAGE
}

download_portland() {
  mkdir -p "$ELEVATION_DIR"
  local target="$ELEVATION_DIR/${SRTM_TILE_NAME}.hgt"
  local tmp
  tmp="$(mktemp)"
  curl -LfsS "$SRTM_TILE_URL" -o "$tmp"
  gzip -cd "$tmp" > "$target"
  rm -f "$tmp"
  echo "Downloaded SRTM tile to $target"
}

case "${1:-}" in
  -h|--help|"")
    usage
    ;;
  download-portland)
    download_portland
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
