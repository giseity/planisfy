# Architecture

Planisfy wraps open geospatial engines with a TypeScript platform layer. The API gateway owns authentication, API keys, rate limits, usage, style and tileset publication, console APIs, internal webhooks, health, metrics, and setup preflight. Specialized engines and workers do heavy map work.

## Apps

- `apps/api`: Hono server. Mounts Better Auth, published map assets, service APIs, console APIs, internal routes, health, metrics, and setup preflight.
- `apps/console`: customer Console and Studio for styles, tilesets, keys, usage, platform readiness, operations, billing, organization, and settings.
- `apps/admin`: internal operations app for accounts, users, jobs, storage, usage, health, audit, and upgrade center.
- `apps/marketing`: public website and managed-mode auth pages.
- `apps/docs`: Fumadocs documentation site.
- `apps/worker-geodata`: outbox dispatcher and BullMQ worker for upload/import processing.
- `apps/elevation`: local HGT DEM lookup service.
- `apps/static-renderer`: local MapLibre PNG renderer.
- `apps/self-host-supervisor`: optional local-only upgrade/backup/rollback API.
- `apps/tile-worker`: placeholder only.

## Shared Packages

Important packages include `@planisfy/auth`, `@planisfy/database`, `@planisfy/env`, `@planisfy/events`, `@planisfy/geodata-contracts`, `@planisfy/platform-policy`, `@planisfy/storage`, `@planisfy/storage-paths`, `@planisfy/style-spec`, `@planisfy/upgrade-manifest`, `@planisfy/ui`, and tooling config packages.

## Data Flow

1. Console creates resources through Hono console routes or colocated server code that uses shared database helpers.
2. Uploads and imports create `processing_jobs`, `storage_objects`, and `event_outbox` rows.
3. The geodata worker claims outbox events, dispatches BullMQ work, invokes DuckDB/GDAL/Tippecanoe as needed, writes artifacts to local/S3/R2 storage, and updates job status.
4. Published style and tileset routes read publication state from PostgreSQL and artifacts from the configured storage backend.
5. External APIs proxy to Martin, Valhalla, Pelias, local elevation, or static renderer.

## Boundaries

- Pure contract packages should not import database, Redis, HTTP, filesystem, or provider SDK code.
- API and workers may import database and provider packages.
- Next.js apps should compose shared UI and API/database helpers rather than duplicating backend rules.
- Worker images can carry heavy geodata tools; the API image should stay focused on request handling.
