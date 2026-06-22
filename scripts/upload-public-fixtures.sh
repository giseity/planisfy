#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(sed 's/\r$//' "$ENV_FILE")
  set +a
fi

BUCKET="${PLANISFY_FIXTURE_BUCKET:-planisfy-fixtures}"
VERSION="${PLANISFY_FIXTURE_VERSION:-v1}"
PUBLIC_BASE_URL="${PLANISFY_FIXTURE_BASE_URL:-}"
OUTPUT_DIR="$ROOT_DIR/dogfood-output/public-fixtures/$VERSION"
CACHE_CONTROL_IMMUTABLE="${PLANISFY_FIXTURE_CACHE_CONTROL:-public, max-age=31536000, immutable}"
CACHE_CONTROL_MANIFEST="${PLANISFY_FIXTURE_MANIFEST_CACHE_CONTROL:-public, max-age=300}"
DRY_RUN=false
SKIP_PUBLIC_ACCESS=false

usage() {
  cat <<USAGE
Usage: scripts/upload-public-fixtures.sh [--dry-run] [--skip-public-access]

Uploads the small public demo fixtures to a Cloudflare R2 bucket with Wrangler.
Wrangler authentication is used for the upload; no R2 credentials are written to
the repository.

Environment:
  PLANISFY_FIXTURE_BUCKET       R2 bucket name. Default: planisfy-fixtures
  PLANISFY_FIXTURE_VERSION      Object prefix. Default: v1
  PLANISFY_FIXTURE_BASE_URL     Public URL for manifest metadata.
  ENV_FILE                      Optional .env file to read. Default: .env
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; continue ;;
    --dry-run) DRY_RUN=true ;;
    --skip-public-access) SKIP_PUBLIC_ACCESS=true ;;
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
    echo "Missing fixture file: ${1#$ROOT_DIR/}" >&2
    exit 1
  fi
}

file_size() {
  wc -c < "$1" | tr -d ' '
}

file_sha256() {
  sha256sum "$1" | awk '{ print $1 }'
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]).slice(1, -1))" "$1"
}

write_manifest() {
  local manifest="$OUTPUT_DIR/manifest.json"
  local checksums="$OUTPUT_DIR/sha256.txt"
  local generated_at
  generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  mkdir -p "$OUTPUT_DIR"
  : > "$checksums"

  cat > "$manifest" <<JSON
{
  "schemaVersion": 1,
  "bucket": "$(json_escape "$BUCKET")",
  "version": "$(json_escape "$VERSION")",
  "publicBaseUrl": "$(json_escape "$PUBLIC_BASE_URL")",
  "generatedAt": "$generated_at",
  "fixtures": [
JSON

  local first=true
  for entry in "${FIXTURES[@]}"; do
    IFS='|' read -r key path content_type <<< "$entry"
    local size
    local sha
    size="$(file_size "$path")"
    sha="$(file_sha256 "$path")"
    printf '%s  %s\n' "$sha" "$key" >> "$checksums"

    if [[ "$first" == true ]]; then
      first=false
    else
      printf ',\n' >> "$manifest"
    fi

    cat >> "$manifest" <<JSON
    {
      "key": "$(json_escape "$VERSION/$key")",
      "size": $size,
      "sha256": "$sha",
      "contentType": "$(json_escape "$content_type")"
    }
JSON
  done

  cat >> "$manifest" <<'JSON'

  ]
}
JSON

  echo "Wrote fixture manifest: ${manifest#$ROOT_DIR/}"
  echo "Wrote fixture checksums: ${checksums#$ROOT_DIR/}"
}

wrangler_upload() {
  local key="$1"
  local path="$2"
  local content_type="$3"
  local cache_control="$4"

  wrangler r2 object put "$BUCKET/$VERSION/$key" \
    --file "$path" \
    --remote \
    --content-type "$content_type" \
    --cache-control "$cache_control"
}

FIXTURES=(
  "pmtiles/stuttgart.pmtiles|$ROOT_DIR/infra/docker/data/pmtiles/stuttgart.pmtiles|application/octet-stream"
  "elevation/N45W123.hgt|$ROOT_DIR/infra/docker/data/elevation/N45W123.hgt|application/octet-stream"
  "fonts/OpenSans-Regular.ttf|$ROOT_DIR/infra/docker/data/fonts/OpenSans-Regular.ttf|font/ttf"
  "pelias/stuttgart.csv|$ROOT_DIR/infra/docker/data/pelias/csv/stuttgart.csv|text/csv; charset=utf-8"
)

for entry in "${FIXTURES[@]}"; do
  IFS='|' read -r _key path _content_type <<< "$entry"
  require_file "$path"
done

require_cmd node
require_cmd sha256sum
write_manifest

if [[ "$DRY_RUN" == true ]]; then
  cat <<DRY_RUN_OUTPUT
Dry run complete. No Cloudflare changes were made.

Bucket: $BUCKET
Prefix: $VERSION/
Manifest: ${OUTPUT_DIR#$ROOT_DIR/}/manifest.json
Checksums: ${OUTPUT_DIR#$ROOT_DIR/}/sha256.txt
DRY_RUN_OUTPUT
  exit 0
fi

require_cmd wrangler

if ! wrangler r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  wrangler r2 bucket create "$BUCKET"
fi

CORS_FILE="$OUTPUT_DIR/cors.json"
cat > "$CORS_FILE" <<'JSON'
{
  "rules": [
    {
      "allowed": {
        "origins": ["*"],
        "methods": ["GET", "HEAD"],
        "headers": ["range", "if-none-match", "if-modified-since"]
      },
      "exposeHeaders": ["etag", "content-length", "content-range", "accept-ranges"],
      "maxAgeSeconds": 86400
    }
  ]
}
JSON

wrangler r2 bucket cors set "$BUCKET" --file "$CORS_FILE" --force

if [[ "$SKIP_PUBLIC_ACCESS" != true ]]; then
  wrangler r2 bucket dev-url enable "$BUCKET"
  wrangler r2 bucket dev-url get "$BUCKET"
fi

for entry in "${FIXTURES[@]}"; do
  IFS='|' read -r key path content_type <<< "$entry"
  wrangler_upload "$key" "$path" "$content_type" "$CACHE_CONTROL_IMMUTABLE"
done

wrangler_upload "manifest.json" "$OUTPUT_DIR/manifest.json" "application/json; charset=utf-8" "$CACHE_CONTROL_MANIFEST"
wrangler_upload "checksums/sha256.txt" "$OUTPUT_DIR/sha256.txt" "text/plain; charset=utf-8" "$CACHE_CONTROL_MANIFEST"

cat <<DONE
Uploaded public fixtures.

Bucket: $BUCKET
Prefix: $VERSION/
Set PLANISFY_FIXTURE_BASE_URL to the public bucket URL plus /$VERSION, then run:
  scripts/self-host-setup.sh --demo-data
DONE
