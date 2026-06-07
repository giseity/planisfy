# Resource Model

## Current

Planisfy now uses `accounts` as the canonical owner anchor for both users and organizations. A temporary `profiles` export remains in the database package for legacy API compatibility, but new code should use account naming.

## Target Identity

- `accounts`: canonical owner anchor for users and organizations.
- `users`: Better Auth user identity, same UUID as account.
- `organizations`: Better Auth organization identity, same UUID as account.
- `oauth_accounts`: Better Auth provider credentials.
- `members` and `invitations`: organization membership.

## Target Map Resources

- `source_credentials`: server-side provider credential payloads.
- `saved_regions`: reusable named regions with bbox/geometry metadata.
- `source_connections`: remote source definitions such as Overture or custom URLs.
- `source_imports`: import attempts tied to datasets and processing jobs.
- `uploads`: raw files or remote imports.
- `datasets`: normalized inspectable source data.
- `dataset_versions`: immutable source snapshots when needed.
- `tilesets`: logical tile products.
- `tileset_versions`: immutable tile artifacts.
- `styles`: editable style draft state.
- `style_versions`: immutable style snapshots.
- `style_publications`: publish events, aliases, and rollback history.

## Target Operations Resources

- `processing_jobs`: user-visible async operations.
- `processing_job_logs`: durable job progress and error details.
- `event_outbox`: transactional worker trigger queue.
- `storage_objects`: artifact ledger.
- `usage_logs` and `usage_rollups`: raw and aggregated usage.
- `audit_events`: actor/resource history.

## Rule

Production URLs must resolve to immutable artifacts or explicit stable aliases. Draft edits must not mutate published behavior.

## Current Publish Contracts

- Tileset uploads enter through `POST /console/uploads` and create `uploads`, `tilesets`, `tileset_versions`, `processing_jobs`, and `storage_objects`.
- A processed tileset version is not public until `POST /console/tilesets/:id/versions/:version/publish` promotes it to `tilesets.currentVersionId`.
- Stable TileJSON is available at `/tiles/v1/{owner}/{tileset}.json` and `/tiles/v1/{owner}.{tileset}.json`.
- Immutable TileJSON is available at `/tiles/v1/{owner}/{tileset}/versions/{version}.json` and `/tiles/v1/{owner}.{tileset}@{version}.json`.
- Style publication creates a `latest` alias plus an immutable `v{version}` alias in `style_publications`.
- Public style `@version` URLs only resolve for versions that have been published.
- Overture import requests enter through `POST /console/source-imports/overture` and create a dataset, `source_imports` row, processing job, and outbox event.
- The current geodata worker runs DuckDB extraction for Overture imports when `OVERTURE_RELEASE` is configured, then records dataset versions, schema, bounds, counts, warnings, artifacts, and provenance. Missing DuckDB/release configuration fails the job instead of recording metadata-only success.
- Imported dataset versions can be handed to the existing tileset build path through `POST /console/datasets/:id/tilesets`. The route creates a tileset, a `tileset.process_dataset` processing job, and a `tileset.build.requested` outbox event with `sourceResourceType=dataset`.
- Overture theme and type values are currently request-level strings. The API stores `theme` as `source_imports.source_name`, includes `theme` and optional `type` in job input, and the worker substitutes them into `OVERTURE_PARQUET_URL_TEMPLATE`. A curated Overture theme/type catalog is still future product work.
