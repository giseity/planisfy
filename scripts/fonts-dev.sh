#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONT_DIR="$ROOT_DIR/infra/docker/data/fonts"
OPENMAPTILES_FONTS_REF="${OPENMAPTILES_FONTS_REF:-0bcd6431ec82fbb74b3a5b697ce315ebf795ad8e}"
OPEN_SANS_URL="https://raw.githubusercontent.com/openmaptiles/fonts/${OPENMAPTILES_FONTS_REF}/open-sans/OpenSans-Regular.ttf"

usage() {
  cat <<'USAGE'
Prepare local fonts for Martin glyph serving.

Usage:
  scripts/fonts-dev.sh download

The default fixture downloads Open Sans Regular from the pinned OpenMapTiles
fonts repository. Martin reads the TTF and serves MapLibre glyph ranges from
/font/Open%20Sans%20Regular/{range}.
USAGE
}

download() {
  mkdir -p "$FONT_DIR"
  local target="$FONT_DIR/OpenSans-Regular.ttf"
  local tmp
  tmp="$(mktemp)"
  curl -LfsS "$OPEN_SANS_URL" -o "$tmp"
  mv "$tmp" "$target"
  echo "Downloaded Open Sans Regular to $target"
}

case "${1:-}" in
  -h|--help|"")
    usage
    ;;
  download)
    download
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
