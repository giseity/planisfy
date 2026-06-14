# Self Hosting

## Goal

Planisfy's main self-host story should be boring and repeatable from the
repository root:

```bash
scripts/self-host-setup.sh
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm -F @planisfy/database db:migrate
```

The default mode is `DEPLOYMENT_MODE=self_host`. The stack should produce a
useful product without cloud credentials, billing, email, or imported
map/routing/geocoding data. Missing map/routing/geocoding data should degrade to
a clear fixture state rather than blocking application startup.

## Current Services

- API
- console
- admin
- docs
- marketing
- worker-geodata
- PostgreSQL
- Redis
- Martin
- Valhalla
- Pelias
- Pelias Elasticsearch
- local artifact storage bind mount configured by `LOCAL_STORAGE_HOST_PATH`
- recommended MinIO S3-compatible storage profile for production-like artifact
  storage
- optional local-only self-host supervisor profile

## Setup Script

Run the setup script before the first Compose boot:

```bash
scripts/self-host-setup.sh
```

The script:

1. copies `.env.example` to `.env` when needed;
2. creates local demo directories under `infra/docker/data/`;
3. copies the Planisfy Streets fixture style into local storage;
4. downloads the configured demo PMTiles fixture when `--demo-data` is passed;
5. validates that the fixture style and source-layer contract agree;
6. reports whether the default `stuttgart.pmtiles` fixture is present;
7. validates the Compose file with `docker compose config`;
8. makes the read-only `/setup/preflight` checks actionable after the API starts;
9. prints the first-account sign-up URL.

Planisfy does not commit binary map data, so a first boot without
`infra/docker/data/pmtiles/stuttgart.pmtiles` is expected. The applications and
health checks should still start, while the default map remains in a
fixture-data-missing state until compatible PMTiles are supplied.

To fetch a known fixture as part of setup, configure `.env`:

```bash
DEMO_PMTILES_PATH="infra/docker/data/pmtiles/stuttgart.pmtiles"
DEMO_PMTILES_URL="https://example.com/path/to/stuttgart.pmtiles"
DEMO_PMTILES_SHA256="optional-lowercase-sha256"
```

Then run:

```bash
scripts/self-host-setup.sh --demo-data
```

The setup script downloads to a temporary file, validates the PMTiles magic
header, checks `DEMO_PMTILES_SHA256` when present, and then installs the file as
`infra/docker/data/pmtiles/stuttgart.pmtiles`.

Run the smoke test when Docker is available:

```bash
scripts/docker-compose-smoke.sh
```

The smoke test validates Compose, runs setup, starts Postgres, Redis, and the
API, waits for `/health`, checks the public `/setup/preflight` product-loop
prerequisites, checks `/health/detailed` for core runtime dependency entries,
optionally reports Martin catalog reachability, runs the default-map smoke when
`infra/docker/data/pmtiles/stuttgart.pmtiles` is present, and removes the
smoke-test containers and volumes on exit.

To check the mounted default map source against an already-running Martin
service without tearing down Compose, run:

```bash
scripts/self-host-default-map-smoke.mjs
```

The smoke verifies the PMTiles magic header, Martin TileJSON vector layer
metadata, and a real non-empty vector tile around Stuttgart.

## Valhalla Dev Graph

Valhalla readiness is route-backed. A container that answers `/status` but has
no graph for the readiness coordinates is reported as degraded by
`/setup/preflight`.

The default readiness probe uses Stuttgart:

```text
9.1829,48.7758;9.1901,48.7784
```

For local full-stack coverage, use a Stuttgart OSM PBF extract, such as the
BBBike Stuttgart Protocolbuffer extract, and keep it under the ignored runtime
data mount:

```bash
mkdir -p infra/docker/data/valhalla_data
curl -L --fail \
  -o infra/docker/data/valhalla_data/Stuttgart.osm.pbf \
  https://download.bbbike.org/osm/bbbike/Stuttgart/Stuttgart.osm.pbf
```

Then build Valhalla graph tiles and the runtime tile extract:

```bash
docker run --rm \
  -v "$PWD/infra/docker/data/valhalla_data:/custom_files" \
  -v "$PWD/infra/docker/configs/valhalla.json:/etc/valhalla/valhalla.json:ro" \
  ghcr.io/valhalla/valhalla:3.7.0 \
  sh -lc 'rm -rf /custom_files/valhalla_tiles /custom_files/valhalla_tiles.tar && mkdir -p /custom_files/valhalla_tiles && valhalla_build_tiles -c /etc/valhalla/valhalla.json /custom_files/Stuttgart.osm.pbf && valhalla_build_extract -c /etc/valhalla/valhalla.json -v'
```

Restart Valhalla and confirm routing:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d valhalla
curl -X POST http://localhost:3007/route \
  -H 'content-type: application/json' \
  --data '{"locations":[{"lon":9.1829,"lat":48.7758},{"lon":9.1901,"lat":48.7784}],"costing":"auto","units":"kilometers"}'
```

Optional flags:

```bash
scripts/self-host-setup.sh --demo-data # download DEMO_PMTILES_URL when missing
scripts/self-host-setup.sh --pull      # pull public engine/database images
scripts/self-host-setup.sh --up        # prepare, then start the full stack
scripts/self-host-setup.sh --migrate   # start dependencies, then run Drizzle migrations
```

## Optional Upgrade Supervisor

The `with-supervisor` Compose profile starts `apps/self-host-supervisor`. It is
disabled by default and should stay local-only:

```bash
SUPERVISOR_TOKEN="generate-a-random-supervisor-token"
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-supervisor up -d self-host-supervisor admin
```

The supervisor exposes:

- `GET /health`
- `GET /version`
- `POST /preflight`
- `POST /backup`
- `POST /upgrade/apply`
- `POST /upgrade/rollback`
- `GET /operations`
- `GET /operations/:id`

All routes except `/health` require `SUPERVISOR_TOKEN` through
`Authorization: Bearer ...` or `x-supervisor-token`. Compose publishes the
service only on `127.0.0.1:4010`; Admin reaches it server-side through
`SUPERVISOR_URL=http://self-host-supervisor:4010`. The Admin Upgrade Center can
run preflight, backup, pinned apply, and guarded rollback without exposing the
token to the browser.

Automated apply requires a valid release manifest and a successful backup
operation ID. Floating `:latest` image targets are refused. Rollback requires a
manifest with `rollbackSupported: true`.

## Recommended MinIO Storage

The simplest self-host profile can use local filesystem storage, but the
production-like path is S3-compatible object storage. For local self-hosting,
use the MinIO profile so the API and workers share artifacts through the same
storage contract as S3/R2 deployments:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
```

Use these `.env` values for the local MinIO profile:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=planisfy-artifacts
S3_REGION=auto
S3_ENDPOINT=http://localhost:9000
CONTAINER_S3_ENDPOINT=http://host.docker.internal:9000
S3_PUBLIC_URL=http://localhost:9000/planisfy-artifacts
AWS_ACCESS_KEY_ID=planisfy
AWS_SECRET_ACCESS_KEY=planisfy-local-minio-password
MINIO_ROOT_USER=planisfy
MINIO_ROOT_PASSWORD=planisfy-local-minio-password
```

The MinIO console is available at `http://localhost:9001`. The `minio-init`
container creates the bucket and enables anonymous download for local artifact
URLs. Use stronger credentials outside local development.

For an all-Compose stack, `S3_ENDPOINT=http://minio:9000` also works. The
`CONTAINER_S3_ENDPOINT` override keeps mixed host+Docker development aligned
when the API runs on the host and workers run in Docker.

## Dev Pelias

The default Compose stack starts a pinned Pelias API container and a single-node
Pelias Elasticsearch container for local end-to-end geocoding smoke coverage:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

The bundled services are intended for a tiny prepared development index, not
for planet-scale imports. Pelias indexing is RAM- and disk-heavy, so keep the
local data scope small. The pinned defaults are:

```bash
PELIAS_API_IMAGE=pelias/api:v7.8.0
PELIAS_ELASTICSEARCH_IMAGE=pelias/elasticsearch:7.17.27-2025-01-22-66b2b704398cecb3f0bccede4286a840972c57f8
PELIAS_SCHEMA_IMAGE=pelias/schema:v9.1.0
PELIAS_CSV_IMPORTER_IMAGE=pelias/csv-importer:v5.4.0
PELIAS_ES_JAVA_OPTS="-Xms2g -Xmx2g"
```

In the bundled Compose network, the API container uses
`CONTAINER_PELIAS_URL=http://pelias:4000`. When running Pelias outside the
Planisfy Compose network, set `CONTAINER_PELIAS_URL` to the container-reachable
URL, such as `http://host.docker.internal:3100`.

The Pelias API is available on the host at `http://localhost:3100`. It will only
return useful geocoding results after Elasticsearch contains a Pelias index.
Seed the tracked Stuttgart CSV fixture with:

```bash
scripts/pelias-dev-fixture.sh --reset
```

The fixture is intentionally tiny and lives at
`infra/docker/data/pelias/csv/stuttgart.csv`. It is enough for local
end-to-end checks such as searching for `Schlossplatz` or `Stuttgart
Hauptbahnhof`. For first-time imports or larger regional builds, use the
official Pelias Docker project and then point `PELIAS_URL`/`CONTAINER_PELIAS_URL`
at the resulting API.

The bundled dev API command includes a startup shim that skips the libpostal
controller when the libpostal service is absent, allowing `/v1/search` to fall
through to Pelias's built-in parser for the tiny CSV fixture. Production or
larger regional Pelias stacks should run the normal Pelias services instead of
using this shim.

## Official Pelias Metro

For production-like geocoder behavior, use the separate official-style metro
project at `infra/pelias/metro`. It keeps the fast Stuttgart CSV fixture out of
the critical dev loop while still giving you a real Pelias import path with
libpostal, Placeholder, PIP, Who's On First, OpenStreetMap, OpenAddresses,
transit, polylines, and pinned Pelias service images.

The metro project defaults to the official Portland metro starter data because
Pelias recommends it for first-time small builds. It is suitable for validating
real parsing, admin lookup, source priority, ranking, and service integration.
It is not a planet import.

```bash
scripts/pelias-metro.sh bootstrap
scripts/pelias-metro.sh pull
scripts/pelias-metro.sh build-core
scripts/pelias-metro.sh up
curl "http://localhost:34100/v1/search?text=Powell%27s%20Books"
```

The default laptop profile is designed for a 12GB WSL limit:

- `PELIAS_ES_HEAP=2g`
- `OPENADDRESSES_PARALLELISM=1`
- `ENABLE_GEONAMES=false`
- interpolation is a separate `scripts/pelias-metro.sh build-interpolation`
  step

When pointing the Planisfy API at this stack, use
`PELIAS_URL=http://localhost:34100` for host-run API development or
`CONTAINER_PELIAS_URL=http://host.docker.internal:34100` for the Planisfy API
container.

## First Account

After the stack is running and migrations have completed, create the first local
Console account at:

```text
http://localhost:3001/sign-up
```

The local demo does not require email delivery. If `RESEND_API_KEY` is unset,
verification emails are not sent, and the Console shows a reminder banner while
still allowing the signed-in user to continue.

Self-host auth is console-local by default. Set `NEXT_PUBLIC_AUTH_ORIGIN` to the
Console origin so the server derives the auth handler URL from it and protected
Console routes redirect to `/sign-in?callbackUrl=...` on the Console origin.
Managed deployments set `NEXT_PUBLIC_AUTH_ORIGIN` to the public Marketing
origin instead.

Managed mode is different: `DEPLOYMENT_MODE=managed` requires Resend, and API
key creation is blocked until the user email is verified.

## Optional Billing

Dodo Payments checkout is disabled unless the API container receives
`DODO_PAYMENTS_API_KEY`, `DODO_PRO_PRODUCT_ID`, and
`DODO_PAYMENTS_WEBHOOK_SECRET`. Set `DODO_PAYMENTS_ENVIRONMENT=live_mode` for
production and configure Dodo to send subscription webhooks to
`/webhooks/dodo`.

For self-host this is optional. For managed mode, Dodo Payments API credentials,
webhook secret, and the Pro product ID are required readiness capabilities.

## Demo Data Layout

| Path                                        | Purpose                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `infra/docker/data/pmtiles/`                | Martin PMTiles mount. Add `stuttgart.pmtiles` for the default `planisfy.basic` source used by Planisfy Streets.    |
| `infra/docker/data/pelias/csv/`             | Tiny Pelias CSV fixture imported by `scripts/pelias-dev-fixture.sh`.                                               |
| `infra/docker/data/valhalla_data/`          | Valhalla graph/runtime data mounted at `/custom_files`; the Stuttgart dev fixture uses `Stuttgart.osm.pbf` plus generated `valhalla_tiles.tar`. |
| `${LOCAL_STORAGE_HOST_PATH:-infra/docker/data/storage}/uploads/`        | Local upload/object storage area.                                                                                  |
| `${LOCAL_STORAGE_HOST_PATH:-infra/docker/data/storage}/styles/`         | Demo and published style JSON. The setup script seeds the legacy, light, and dark Planisfy Streets fixture styles. |
| `${LOCAL_STORAGE_HOST_PATH:-infra/docker/data/storage}/martin-sources/` | Local aliases for published PMTiles/MBTiles artifacts when using filesystem storage. Published PMTiles are served by the API from storage. |
| `packages/map-styles/`                      | Versioned Planisfy Streets fixture style, source-layer contract, schema, and release manifest.                     |

The repository intentionally does not store binary map data. Keep downloaded
PMTiles and Valhalla graph data outside Git while preserving these mount points.
Use `DEMO_PMTILES_URL` plus `scripts/self-host-setup.sh --demo-data` when a
team wants a repeatable local download path for the default fixture.

After the PMTiles file is present, generate regional basemap release metadata
without committing the binary:

```bash
pnpm -F @planisfy/map-styles build:regional-release -- \
  --name stuttgart \
  --version v1 \
  --pmtiles infra/docker/data/pmtiles/stuttgart.pmtiles
```

Generated output lives under ignored `packages/map-styles/dist/regional/` and
records the source PMTiles SHA-256, size, source-layer contract, and style URL.

To generate a tiny regional PMTiles artifact through Planetiler from the tracked
fixture input and then write release metadata:

```bash
pnpm -F @planisfy/map-styles build:planetiler-regional -- \
  --name fixture \
  --version dev
```

This command requires Docker because it runs
`ghcr.io/onthegomap/planetiler:0.10.2`. The resulting PMTiles and metadata stay
under ignored `packages/map-styles/dist/regional/`.

## Source Imports

The geodata split is explicit:

- Tippecanoe plus GDAL/`ogr2ogr` power ad hoc GeoJSON, CSV, and zipped
  Shapefile upload tiling in `worker-geodata`.
- DuckDB powers Overture/source import extraction in `worker-geodata`.
- Planetiler powers reproducible regional basemap release builds in
  `@planisfy/map-styles`, outside the default worker runtime.

Overture imports run in `worker-geodata` through DuckDB. Set `OVERTURE_RELEASE`
to a concrete Overture release and make sure `DUCKDB_PATH` resolves inside the
worker image or host process. The default parquet template reads the public
Overture S3 layout and requires import requests to include a theme, type, and
saved-region bbox. If DuckDB or release config is missing, the import job fails
with `OVERTURE_IMPORT_FAILED` instead of recording metadata-only success.

Upload tiling requires `TIPPECANOE_PATH` and `OGR2OGR_PATH`; the worker Docker
image installs both. `GEODATA_ALLOW_RAW_FALLBACK=false` is the default. Set it
to `true` only for local degraded development where storing a non-served raw
artifact is preferable to failing a job.

Saved source credentials are encrypted by the API before they are written to the
database. Set `SOURCE_CREDENTIAL_ENCRYPTION_KEY` to a `base64:`-prefixed 32-byte
key in production. Remote source URLs reject localhost, private IP ranges, and
metadata-service hosts by default; only set `ALLOW_PRIVATE_SOURCE_URLS=true` for
explicitly isolated deployments that need internal source endpoints.

## Published Tile Delivery

The API exposes stable public tileset URLs:

| API URL                                             | Artifact version            |
| --------------------------------------------------- | --------------------------- |
| `/tiles/v1/{owner}.{tileset}/{z}/{x}/{y}`           | Current published version   |
| `/tiles/v1/{owner}.{tileset}@{version}/{z}/{x}/{y}` | Immutable published version |

The default config includes `planisfy.basic` and `planisfy.basic.v1` aliases for
the local fixture. User-published PMTiles are served by the API directly from
configured artifact storage, including local filesystem storage, MinIO/S3, and
R2. This avoids coupling API, worker, and Martin to one shared upload directory.
MBTiles artifacts can still be bridged through deployment-specific tile serving
glue.

## Migrations

Run database migrations after Postgres is healthy:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres redis
pnpm -F @planisfy/database db:migrate
```

## Backup And Restore

Create a self-host backup before upgrades or risky maintenance:

```bash
scripts/self-host-backup.sh
```

Restore from a backup directory with an explicit confirmation flag:

```bash
scripts/self-host-restore.sh --backup backups/planisfy-YYYYMMDDTHHMMSSZ --confirm
```

Backups include PostgreSQL, Redis when reachable, local storage, PMTiles, and
Valhalla data. See [docs/operations.md](./operations.md) for the full recovery
and upgrade flow.

Create a diagnostic support bundle when troubleshooting a self-host install:

```bash
scripts/self-host-support-bundle.sh
```

The bundle includes redacted environment key presence, rendered Compose config,
container status, recent logs, and API health/metrics responses.

For a full demo boot:

```bash
scripts/self-host-setup.sh --up
pnpm -F @planisfy/database db:migrate
```

## Health Checks

Basic checks after startup:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:4000/setup/preflight
curl http://localhost:4000/metrics
curl http://localhost:3005/catalog
curl http://localhost:3007/status
```

Expected notes:

- `/health` should return quickly once the API container is ready.
- `/health/detailed` is the best single endpoint for database, Redis, engine,
  worker heartbeat, and storage configuration status.
- `/setup/preflight` is a public read-only first-run checklist for identity,
  storage, seeded demo styles, published tile aliases, and the optional PMTiles
  fixture.
- `/health/detailed` reports local storage as `ok` when the configured path is
  reachable. S3 and R2 storage are reported as configured or degraded based on
  environment variables without making remote bucket calls.
- `/metrics` exposes Prometheus text metrics for API request counts, latency,
  process uptime, and build info.
- Martin can start without `stuttgart.pmtiles`, but tile requests for
  `planisfy.basic` or `planisfy.basic@1` require that local file.
- Valhalla starts with the mounted data directory, and `/setup/preflight`
  reports it as passing only when the configured route-readiness probe can
  route through the mounted graph.

## Default Service URLs

| Service   | URL                     |
| --------- | ----------------------- |
| Marketing | <http://localhost:3000> |
| Console   | <http://localhost:3001> |
| Docs      | <http://localhost:3002> |
| Admin     | <http://localhost:3003> |
| API       | <http://localhost:4000> |
| Martin    | <http://localhost:3005> |
| Valhalla  | <http://localhost:3007> |
| Pelias    | <http://localhost:3100> |
| Static renderer | <http://localhost:4300> |

## Target Additions

- PostGIS-enabled database image.
- broader automated demo-data smoke coverage for PMTiles, Valhalla routing,
  Pelias geocoding, and static PNG rendering.

## Acceptance

- Setup reports whether the default PMTiles fixture is present.
- Public setup preflight reports seeded style fixtures, upload storage,
  published tile alias storage, and PMTiles readiness.
- Console shows a real map when compatible PMTiles are supplied.
- Demo style, source metadata, and sample tiles agree.
- Health/preflight reports API, database, Redis, Martin, Valhalla, Pelias,
  static rendering, and worker-geodata state without blocking on optional
  managed billing or email.
- New developers can complete setup from the README and docs.

## Console Navigation Notes

The Console URL tree is organized by customer workflows:

- Studio resources live at `/styles`, `/styles/[styleId]`, and `/tilesets`.
- Developer pages live at `/keys`, `/usage`, and `/integration`.
- Operational pages live under `/operations/*`.
- Account pages live at `/organization`, `/team`, `/billing`, and
  `/settings/*`.

The style editor remains full-screen. Admin stays a separate app and has its
own sidebar/navigation manifest.
