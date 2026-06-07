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
`/health`, checks `/health/detailed` for Postgres, Redis, storage,
worker-geodata, Martin, and Valhalla entries, optionally reports a reachable
Martin catalog, and then cleans up containers and volumes.
