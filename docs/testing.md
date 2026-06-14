# Testing

## Current

Test coverage is intentionally focused on current platform contracts.
`vitest.workspace.ts` exists for workspace package tests, while API and worker
tests currently run through package-level Node test scripts. `pnpm test` runs
the fast infrastructure-free suite through Turbo and currently passes.

## Target

Keep `pnpm test` fast and infrastructure-free by default, then add explicit
opt-in smoke and integration checks for Docker, database, Redis, Martin,
Valhalla, and processing workflows.

## Ownership Map

- `@planisfy/events`: event payload schemas and invalid examples.
- `@planisfy/storage-paths`: key builders, parsers, and path safety.
- `@planisfy/database`: schema helpers, source import model, and version/publish helpers.
- `@planisfy/style-spec`: MapLibre validation and draft/publish transforms.
- `apps/api`: auth, scopes, style routes, upload/import init, outbox writes.
- `apps/worker-geodata`: event claiming, upload validation, failure states, artifact versioning, Tippecanoe/GDAL toolchain behavior, and DuckDB source import dispatch.
- `@planisfy/map-styles`: style release manifests, source-layer contracts, and Planetiler regional build command/metadata behavior.
- `apps/console`: Studio state helpers, shared style validation, publish/source flows, and upload job controls.
- `apps/admin`: health and dashboard logic.

## Policy

Fast tests should not require Postgres, Redis, S3/R2, Martin, Valhalla, GDAL, DuckDB, Tippecanoe, Docker, or Planetiler. DB, Docker, and real geodata toolchain smoke tests should be opt-in or clearly marked.

## Smoke Tests

Run the Docker Compose smoke test when Docker is available:

```bash
scripts/docker-compose-smoke.sh
```

The smoke script validates Compose, starts Postgres, Redis, and the API, polls
`/health`, checks `/setup/preflight`, checks `/health/detailed` for Postgres,
Redis, storage, worker-geodata, Martin, and Valhalla entries, optionally
reports a reachable Martin catalog, runs the default-map smoke when
`infra/docker/data/pmtiles/stuttgart.pmtiles` is present, and then cleans up
containers and volumes.

When the self-host stack is already running with Martin and the demo PMTiles
fixture, run the default-map smoke directly:

```bash
scripts/self-host-default-map-smoke.mjs
```

It verifies the PMTiles magic header, Martin TileJSON vector layer metadata,
and a non-empty vector tile around Stuttgart.

For full local service smoke after the stack is already running, verify the
graph-backed and browser-backed services explicitly:

```bash
curl "http://localhost:3100/v1/search?text=Stuttgart&size=1"
curl -X POST http://localhost:3007/route \
  -H 'content-type: application/json' \
  --data '{"locations":[{"lon":9.1829,"lat":48.7758},{"lon":9.1901,"lat":48.7784}],"costing":"auto","units":"kilometers"}'
curl http://localhost:4300/health
```

`/setup/preflight` should have no blocking failures for a local full-stack
dev run. Production readiness can still warn about release manifests,
credential encryption, Overture release selection, email, billing, and other
operator choices.

Upload-format smoke coverage lives in `apps/worker-geodata`: the fast worker
tests validate GeoJSON, CSV, zipped Shapefile, PMTiles, and MBTiles fixtures
without requiring GDAL, Tippecanoe, Redis, Postgres, or object storage.

CI runs the same non-binary smoke script after lint, typecheck, tests, builds,
and Docker image builds. Real PMTiles rendering remains manual/opt-in through
the `Demo Data Smoke` workflow because the repository does not commit binary map
fixtures. Trigger that workflow with a PMTiles URL and optional SHA-256 checksum
when validating a release candidate with rendered fixture TileJSON.

The trust gate now includes:

- `pnpm lint`
- `pnpm check-types`
- `pnpm test`
- `pnpm build`
- Docker image builds for API, Console, Admin, Docs, Marketing,
  worker-geodata, and self-host supervisor
- non-binary Compose smoke
- optional/manual PMTiles, Pelias, Valhalla routing, and browser/static-renderer
  smoke
