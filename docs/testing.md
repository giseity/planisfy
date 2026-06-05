# Testing

## Current

Test coverage is intentionally small and focused on alpha platform contracts.

## Target

Add `vitest.workspace.ts` so `pnpm test` runs fast infrastructure-free tests by default.

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
