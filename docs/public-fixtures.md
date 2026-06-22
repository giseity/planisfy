# Public Fixtures

Planisfy can publish small, reusable self-host demo fixtures to a public
Cloudflare R2 bucket. These files are only for local demos and smoke tests; they
are not production basemap data.

## Bucket

The recommended bucket name is `planisfy-fixtures`, with versioned objects under
`v1/`:

```text
v1/manifest.json
v1/checksums/sha256.txt
v1/pmtiles/stuttgart.pmtiles
v1/elevation/N45W123.hgt
v1/fonts/OpenSans-Regular.ttf
v1/pelias/stuttgart.csv
```

Create and upload with Wrangler:

```bash
pnpm fixtures:upload
```

The script uses the authenticated Wrangler session for bucket administration and
uploads. It does not write R2 access keys or Cloudflare credentials to the
repository. It reads `.env` by default so the manifest can include
`PLANISFY_FIXTURE_BASE_URL`.

Use `pnpm fixtures:upload -- --dry-run` to generate the manifest and checksum
files under `dogfood-output/public-fixtures/v1/` without changing Cloudflare.

## Self-Host Setup

Set `PLANISFY_FIXTURE_BASE_URL` to the public URL for the version prefix:

```bash
PLANISFY_FIXTURE_BASE_URL="https://pub-61ad6d8b2ab1446f9265de304694e404.r2.dev/v1"
scripts/self-host-setup.sh --demo-data
```

`DEMO_PMTILES_URL` can override the PMTiles URL directly. When using the public
Planisfy fixture base URL, the setup script verifies the Stuttgart PMTiles
checksum before installing it.

If the public bucket is unavailable, set one of these fallbacks:

```bash
DEMO_PMTILES_FALLBACK_URL="https://mirror.example.com/stuttgart.pmtiles"
DEMO_PMTILES_FALLBACK_PATH="/path/to/stuttgart.pmtiles"
```

If `infra/docker/data/pmtiles/stuttgart.pmtiles` already exists, setup validates
and reuses it without contacting the public bucket.
