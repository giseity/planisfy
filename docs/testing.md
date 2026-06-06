# Testing

## Current

Test coverage is intentionally small and focused on alpha platform contracts.
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
- `@planisfy/database`: schema helpers and version/publish helpers.
- `@planisfy/style-spec`: MapLibre validation and draft/publish transforms.
- `apps/api`: auth, scopes, style routes, upload init, outbox writes.
- `apps/worker-geodata`: event claiming, upload validation, failure states, artifact versioning.
- `apps/console`: Studio state helpers, shared style validation, and publish/source flows.
- `apps/admin`: health and dashboard logic.

## Policy

Fast tests should not require Postgres, Redis, S3/R2, Martin, Valhalla, GDAL, DuckDB, or Tippecanoe. DB and Docker smoke tests should be opt-in or clearly marked.

## Smoke Tests

Run the Docker Compose smoke test when Docker is available:

```bash
scripts/docker-compose-smoke.sh
```

The smoke script validates Compose, starts Postgres, Redis, and the API, polls
`/health`, checks `/health/detailed` for Postgres, Redis, and storage entries,
and then cleans up containers and volumes.
