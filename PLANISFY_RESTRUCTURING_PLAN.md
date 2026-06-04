# Planisfy Architecture and DX Restructuring Plan

## Implementation Progress

This file is now the running restructuring log. Each completed milestone should update this section before its commit.

| Milestone | Status | Notes |
| --- | --- | --- |
| Phase 0: Documentation and Truth Reset | Complete | Added durable docs scaffold, unignored root `docs/`, corrected stale implemented package/app docs, and documented alpha Polar references as billing work to replace. |
| Phase 1: Package Boundary Setup | Complete | Added pure contract packages for events, storage paths, style lifecycle helpers, logger, and a Vitest workspace. Lockfile importers were updated manually because registry DNS failures prevented `pnpm install` from completing. |
| Phase 2: Database and Resource Model Reset | Not started | Pending `accounts` identity anchor reset and resource tables. |
| Phase 3: Async and Storage Backbone | Not started | Pending outbox, jobs, storage ledger, and provider alignment. |
| Phase 4: Worker Split | Not started | Pending `apps/worker-geodata`. |
| Phase 5: Frontend and API DX | Not started | Pending typed client/style package adoption in console/admin. |
| Phase 6: Self-Host Product Proof | Not started | Pending compose updates, seeds, health, and smoke test. |

## Purpose

This document is a pre-roadmap foundation plan for Planisfy.

The product roadmap describes what Planisfy should become. This document describes how the repository, architecture, durable contracts, documentation, and developer experience should be restructured before major roadmap execution begins.

The guiding idea:

> Borrow Geobble's engineering operating system, not Geobble's product complexity.

Planisfy should remain a focused, self-hostable Mapbox/MapLibre alternative. It should not become Geobble. But Geobble has several mature patterns that Planisfy should adopt before building the basemap, upload, processing, publishing, and cloud surfaces.

## Working Assumptions

- No backward compatibility is required at this stage.
- Database schemas, route shapes, package names, app boundaries, and docs can change freely.
- Complex restructuring is acceptable when the long-term payoff is real.
- Planisfy can adopt Geobble technologies and package patterns when they are a better fit.
- Planisfy will use Dodo Payments for billing and payments when commercial/cloud work begins.
- The first durable product remains: self-hosted maps, global basemap, custom uploads, Studio, stable MapLibre-compatible delivery, optional hosted cloud.

## What To Borrow From Geobble

### Durable Platform Documentation

Geobble's strongest DX pattern is that architecture is documented as a set of durable references, not just README marketing.

Planisfy should add:

- `docs/architecture.md`
- `docs/resource-model.md`
- `docs/events.md`
- `docs/storage.md`
- `docs/operations.md`
- `docs/security.md`
- `docs/testing.md`
- `docs/basemap-pipeline.md`
- `docs/self-hosting.md`

Each app and important package should also have a local `AGENTS.md` or `README.md` with:

- what it owns
- what it does not own
- dependency boundaries
- important routes or exports
- testing commands
- gotchas
- forbidden shortcuts

The key improvement is not more prose. It is documentation that prevents architectural drift.

### Transactional Outbox

Geobble's `eventOutbox` is a better foundation than direct API-to-BullMQ enqueueing.

Planisfy should adopt a transactional outbox for async work:

1. API validates and writes the primary state change.
2. API writes an outbox event in the same database transaction.
3. Worker polls due events, claims them, and enqueues/processes work.
4. Worker writes completion, failure, retry, and logs back to durable tables.

Redis/BullMQ should be transport and scheduling, not the source of truth.

Planisfy async events should include:

- `upload.created`
- `upload.validated`
- `dataset.normalized`
- `tileset.build.requested`
- `tileset.build.completed`
- `tileset.build.failed`
- `tileset.version.published`
- `style.publish.requested`
- `basemap.release.requested`
- `basemap.release.completed`
- `usage.rollup.requested`
- `artifact.cleanup.requested`

### Typed Event Contracts

Add `packages/events`.

This should be a pure package that exports Zod schemas and TypeScript types for all async event payloads.

Rules:

- every known event has a schema
- workers parse payloads before handling them
- unknown event names are not silently relied on
- event docs and schemas stay in lockstep
- tests cover valid and invalid payload examples

This package should have no database, filesystem, Redis, or HTTP dependencies.

### Storage Path Contracts

Add `packages/storage-paths`.

All upload keys, artifact keys, basemap release keys, sprites, glyphs, thumbnails, and manifests should be generated through this package.

Avoid ad hoc string keys such as:

```ts
`uploads/${ownerId}/${id}/${filename}`
```

Prefer named builders:

```ts
StoragePaths.uploadOriginal(accountId, uploadId, fileName)
StoragePaths.tilesetVersion(accountId, tilesetId, version, "pmtiles")
StoragePaths.basemapRelease("planisfy-streets", version, "manifest.json")
```

The package should also parse known paths back into structured metadata for callbacks, cleanup, audit, and support tools.

### Worker Ownership Boundaries

Geobble's worker docs are useful because they define ownership.

Planisfy should split long-running work out of the API:

| App | Responsibility |
| --- | --- |
| `apps/api` | Auth, API keys, resource CRUD, style routes, upload creation, transactional writes, public map API gateway. |
| `apps/worker-geodata` | Upload validation, GDAL/ogr2ogr, Tippecanoe, PMTiles/MBTiles conversion, basemap build jobs, tile artifact validation. |
| `apps/worker-platform` | Usage rollups, artifact cleanup, health probes, backup verification jobs, retention policies. |
| `apps/worker-render` | Optional static image rendering and map thumbnail capture once static images become real. |
| `apps/tile-worker` | Optional Cloudflare Worker/R2 PMTiles delivery for hosted cloud or advanced self-host edge setups. |

The API should not perform heavy geospatial processing. Next.js apps should not own backend business logic.

### Test Map

Geobble's test documentation is valuable because it states what each package is expected to protect.

Planisfy should add `vitest.workspace.ts` and make `pnpm test` run fast infrastructure-free tests by default.

Initial test ownership:

| Project | Coverage |
| --- | --- |
| `packages/events` | event payload schemas, unknown events, invalid examples |
| `packages/storage-paths` | key builders, parsers, path safety |
| `packages/database` or `packages/db` | schema helpers, soft-delete uniqueness helpers, publishing/version helpers |
| `packages/style-spec` | draft/publish validation, MapLibre style mutation helpers |
| `apps/api` | auth, API key scopes, style routes, upload init, outbox writes |
| `apps/worker-geodata` | job claiming, upload validation, failure states, PMTiles versioning |
| `apps/console` | Studio state helpers, publish flow, source picker behavior |
| `apps/admin` | health/job dashboard pure logic |

DB-backed smoke tests can be opt-in. Fast tests should not require Postgres, Redis, S3/R2, Martin, or Valhalla unless explicitly marked.

## What Not To Borrow From Geobble

Planisfy should not copy these unless the product roadmap changes:

- AI workspace editing
- Automerge/CRDT collaboration
- Geobble's credit billing and storage rental model
- full resource sharing/social graph complexity
- DuckDB/GeoParquet as a universal product requirement
- portless local development as the main self-host story
- Geobble's large app count for its own sake

Some of these may become useful later. They should not shape Planisfy v1.

## Recommended Technology Adoptions

### Adopt Strongly

These are a good fit for Planisfy:

- Hono as the API framework
- `@hono/zod-validator` for route validation
- Zod runtime schemas for event and API contracts
- Drizzle for database schema and queries
- PostgreSQL with PostGIS enabled
- BullMQ for worker transport
- transactional outbox in Postgres
- Pino-style structured logging
- AWS SDK S3 client for S3/R2-compatible signed URLs
- Tippecanoe for vector tile generation
- GDAL/ogr2ogr for broad geodata import
- PMTiles as the default immutable artifact format
- DuckDB for basemap/global-data build jobs and Parquet-heavy processing

### Adopt Selectively

These are useful but should be scoped:

- GeoParquet as an internal processing format for basemap builds, Overture ingestion, exports, and possibly large uploaded datasets
- Cloudflare R2 event worker pattern for Planisfy Cloud and advanced self-host modes
- Hono RPC or a generated typed API client for console/admin DX
- TanStack Query hooks in a `packages/hooks` package if console/admin API use grows
- browser capture worker only when static images/thumbnails need real rendering
- Dodo Payments integration patterns from Geobble when Planisfy reaches billing/cloud work

### Do Not Adopt Yet

These are not needed for Planisfy's first strong version:

- Automerge
- CRDT sync
- Geobble Map Specification as-is
- AI SDK workspace mutation flows
- Geobble's credit ledger/storage rental billing model
- SearXNG/embedding search infrastructure

## Proposed Repository Shape

### Apps

Recommended target apps:

| App | Keep/Add | Notes |
| --- | --- | --- |
| `apps/api` | keep | Hono API. Owns business logic and public API gateway. |
| `apps/console` | keep | Customer console and Studio. Pure frontend plus server actions only where explicitly allowed. |
| `apps/admin` | keep | Internal/admin operations. Should include jobs, health, artifacts, usage, audit. |
| `apps/docs` | keep | Public and self-host docs. |
| `apps/marketing` | keep | Public website. Can remain isolated. |
| `apps/worker-geodata` | add | Geodata processing, basemap builds, tileset builds. |
| `apps/worker-platform` | add later | Usage rollups, cleanup, operational reconciliation. |
| `apps/worker-render` | add later | Static images and screenshots. |
| `apps/tile-worker` | keep/rebuild | Edge PMTiles delivery when cloud/edge mode is ready. |

### Packages

Recommended target packages:

| Package | Keep/Add/Rename | Notes |
| --- | --- | --- |
| `packages/auth` | keep | better-auth setup and shared helpers. |
| `packages/database` or `packages/db` | keep or rename | Consider `@planisfy/db` for brevity. Owns schema, relations, migrations, DB helpers. |
| `packages/events` | add | Typed event payload schemas. |
| `packages/storage-paths` | add | Object key builders/parsers. |
| `packages/style-spec` | add | MapLibre style lifecycle helpers, validation, draft/publish transforms. |
| `packages/api-client` | add | Typed client for console/admin. Hono RPC is worth evaluating. |
| `packages/hooks` | add selectively | Shared TanStack Query hooks if frontend data access grows. |
| `packages/map-styles` | keep/rebuild | Default style JSON, sprites, glyph metadata, basemap style assets. |
| `packages/types` | keep but reduce | Prefer colocated contract packages over one broad type bucket. |
| `packages/utils` | keep but narrow | Pure utilities only. No service clients. |
| `packages/logger` | add | Shared structured logging factory/middleware. |
| config/UI packages | keep | Existing shared UI, eslint, prettier, TypeScript packages. |

## Database Reset Recommendation

Because backward compatibility is not required, Planisfy should consider a clean schema reset instead of accreting migrations around the current alpha shape.

### Identity Anchor

Current Planisfy uses `profiles` as the shared owner type. This is conceptually good.

Recommended change:

- rename the shared owner anchor to `accounts`
- make `users.id = accounts.id`
- make `organizations.id = accounts.id`
- rename Better Auth OAuth accounts to `oauth_accounts`
- make all owned resources reference `accounts.id`

Reasoning:

- `accounts` better fits billing, ownership, API keys, usage, storage, and org/user abstraction
- Geobble has proven this pattern is workable
- avoiding Better Auth's generic `accounts` table name conflict is worth the reset

If the public product language prefers "profile," expose that in API/UI copy, not necessarily the schema.

### Core Tables

Target core tables:

- `accounts`
- `users`
- `organizations`
- `members`
- `invitations`
- `sessions`
- `oauth_accounts`
- `verifications`
- `api_keys`
- `uploads`
- `datasets`
- `dataset_versions`
- `tilesets`
- `tileset_versions`
- `styles`
- `style_versions`
- `style_publications`
- `processing_jobs`
- `processing_job_logs`
- `event_outbox`
- `storage_objects`
- `basemap_releases`
- `usage_logs`
- `usage_rollups`
- `audit_events`
- `billing_customers`
- `billing_transactions`
- `plans`
- `subscriptions`

### Resource Model

Recommended meanings:

- `uploads`: raw file or remote import lifecycle
- `datasets`: normalized editable or inspectable source data
- `dataset_versions`: immutable snapshots of normalized source data when needed
- `tilesets`: logical tile product
- `tileset_versions`: immutable tile build artifact
- `styles`: editable style object and draft state
- `style_versions`: immutable style snapshots
- `style_publications`: publish events and rollback history
- `storage_objects`: durable ledger for local/S3/R2 artifacts
- `processing_jobs`: user-visible async operation state
- `event_outbox`: durable worker trigger queue
- `billing_customers`: Dodo customer mapping and billing identity
- `billing_transactions`: local payment and webhook reconciliation records
- `plans` and `subscriptions`: commercial plan state, quotas, and entitlement source

This gives Planisfy a stronger foundation for upload processing, publishing, rollback, audit, and operations.

## Billing Architecture

Planisfy should use Dodo Payments for commercial billing.

Billing should not block the open-core self-hosted product, but the schema and architecture should leave a clean path for hosted cloud and paid plans.

Recommended approach:

- use Dodo Payments as the payment provider
- replace the current alpha Polar references and `POLAR_ACCESS_TOKEN` assumptions during the billing restructure
- keep local database state as the enforcement source of truth
- make Dodo webhook handling idempotent
- store provider IDs and normalized transaction state locally
- do not require Dodo for local/self-host development
- avoid Geobble's storage-rental credit model unless Planisfy later chooses usage credits as a product strategy

Initial billing tables should support:

- customer mapping
- checkout/session tracking
- subscription state
- plan limits
- usage metering events
- webhook idempotency
- admin/support inspection

Commercial enforcement should be based on local plan and subscription state. Provider synchronization should repair or update that state, not become the only source of truth.

## Style Architecture

Do not copy Geobble's GMS wholesale. Planisfy should define a smaller style lifecycle around MapLibre compatibility.

Recommended package: `packages/style-spec`.

Lifecycle:

```text
draft style -> validated style -> published style version -> resolved MapLibre style
```

Responsibilities:

- validate MapLibre style JSON
- normalize source URL references
- protect published versions from draft edits
- generate default layers from tileset metadata
- provide shared style mutation helpers for API and console
- expose readable validation errors for Studio

Rules:

- Studio edits draft state
- published URLs serve immutable versions or stable aliases
- API owns publish/rollback mutations
- console should not duplicate publish logic in local-only helpers

## Storage Architecture

Planisfy should have a storage ledger and path contract before custom uploads become serious.

Recommended pieces:

- `packages/storage-paths`
- `storage_objects` table
- local filesystem provider
- S3/R2-compatible provider
- signed upload support for cloud and advanced self-host
- API multipart upload path for simple local self-host

Storage objects should track:

- account ID
- bucket/provider
- storage key
- file name
- content type
- size
- content hash when available
- resource type
- resource ID
- artifact kind
- version
- deleted timestamp
- metadata

Storage should be inspectable from admin. Operators should be able to answer: what object exists, why does it exist, who owns it, and what resource/version points to it?

## Async Processing Architecture

Planisfy should use both `processing_jobs` and `event_outbox`.

Use `processing_jobs` for user-visible operation state:

- type
- status
- progress
- account ID
- input references
- output references
- logs
- retry count
- cancel state
- started/completed timestamps
- error code/message

Use `event_outbox` for durable worker triggers:

- event name
- payload
- status
- attempts
- process at
- last error

Relationship:

- user starts upload/build/publish operation
- API creates or updates a `processing_jobs` row
- API writes an `event_outbox` row in the same transaction
- worker claims event
- worker updates job progress/logs
- worker writes artifact/version outputs
- worker completes/fails the job

This separation matters because not every event is user-facing, and not every job maps to one event forever.

## Geodata Worker Architecture

Add `apps/worker-geodata`.

Responsibilities:

- validate uploaded files
- parse GeoJSON and CSV
- import zipped Shapefiles and GeoPackage through GDAL/ogr2ogr
- use PostGIS for staging and metadata extraction
- use DuckDB for Parquet/Overture/basemap-heavy data processing
- run Tippecanoe
- create PMTiles/MBTiles artifacts
- validate tile sizes and metadata
- write tileset versions
- build basemap releases
- persist job logs and errors

Non-responsibilities:

- user authentication
- API key validation
- public HTTP routing
- Studio business logic
- billing decisions
- frontend state

Worker dependencies can be heavier than API dependencies. Keep GDAL, Tippecanoe, DuckDB, and build tools in worker containers rather than the API image.

## API Architecture

`apps/api` should remain the only backend business logic entrypoint.

Recommended changes:

- use `@hono/zod-validator` consistently
- adopt structured logging middleware
- add env validation
- move direct queue enqueueing out of route handlers
- write events through shared outbox helpers
- expose job, upload, tileset, style, artifact, usage, and health routes
- keep public map API routes separate from console/admin routes
- centralize access checks and API key scope checks

Route groups:

- `/health`
- `/api/auth/*`
- `/console/*`
- `/admin/*`
- `/styles/v1/*`
- `/tiles/v1/*`
- `/fonts/*`
- `/sprites/*`
- `/uploads/*`
- `/datasets/*`
- `/tilesets/*`
- `/jobs/*`
- `/internal/*`

Internal routes should require a shared secret in every production-like configuration.

## Frontend Architecture

Planisfy's Next.js apps should be mostly pure frontends.

Recommended policy:

- console/admin use API routes instead of duplicating business rules
- server actions may remain only for narrow UI-adjacent operations if they call shared DB/API helpers consistently
- consider `packages/api-client` so console/admin calls are typed
- consider `packages/hooks` if TanStack Query patterns grow
- Studio should call shared `style-spec` helpers rather than owning style mutation semantics alone

The goal is simple: users experience a polished product, while contributors know where the truth lives.

## Documentation Restructuring

Current Planisfy docs and READMEs include stale statements such as "Fastify" and "implementation pending" for implemented Hono packages. This should be fixed before expanding the codebase.

Recommended durable docs:

### `docs/architecture.md`

- system shape
- app/package map
- API/frontend/worker boundaries
- identity model
- resource model overview
- self-host runtime

### `docs/resource-model.md`

- accounts
- uploads
- datasets
- tilesets
- styles
- jobs
- artifacts
- usage
- audit
- versioning/publishing semantics

### `docs/events.md`

- event names
- payload schemas
- producers
- consumers
- retry behavior
- relationship to processing jobs

### `docs/storage.md`

- providers
- path builders
- storage object ledger
- local filesystem mode
- S3/R2 mode
- artifact lifecycle
- cleanup/reconciliation

### `docs/operations.md`

- health checks
- Docker Compose verification
- worker recovery
- job retry
- backup/restore
- basemap release verification
- deploy checklist

### `docs/security.md`

- auth/session/API key checks
- upload validation
- SSRF risk for remote imports
- storage path safety
- internal route protection
- tile/artifact access
- admin routes

### `docs/testing.md`

- root commands
- package/app coverage map
- smoke tests
- integration test policy
- known gaps

### Local App/Package Docs

Add local docs for at least:

- `apps/api`
- `apps/console`
- `apps/admin`
- `apps/worker-geodata`
- `apps/tile-worker`
- `packages/database` or `packages/db`
- `packages/events`
- `packages/storage-paths`
- `packages/style-spec`
- `packages/map-styles`
- `packages/auth`

## Self-Host Runtime

Planisfy should not copy Geobble's infrastructure-only Compose as the main story.

Planisfy's promise requires:

```bash
docker compose up
```

to produce a useful product.

Recommended Compose services:

- api
- console
- admin
- docs
- worker-geodata
- worker-platform when added
- postgres with PostGIS
- redis
- martin
- valhalla
- local object storage or mounted local artifact directory
- optional minio profile for S3-compatible self-host testing
- optional traefik profile

The demo should work without cloud credentials, billing, email, routing data, or geocoding.

## Basemap Pipeline Foundation

Because Milestone 2 keeps the global zoom 0-14+ basemap target, the restructuring should prepare for a serious pipeline.

Recommended decisions:

- worker-geodata owns basemap builds
- DuckDB is acceptable for Overture/Natural Earth/Parquet-heavy processing
- PostGIS can be used for staging, validation, geometry checks, and metadata extraction
- Tippecanoe creates PMTiles artifacts
- basemap releases are immutable storage artifacts
- release manifests are first-class records
- source-layer schema is versioned and documented
- regional fixtures exist for fast tests, but the release target remains global

Add `basemap_releases` with:

- name
- version
- status
- source data versions
- schema version
- artifact storage object ID
- manifest storage object ID
- bounds
- min/max zoom
- attribution
- build job ID
- published timestamp

## Suggested Restructuring Phases

### Phase 0: Documentation and Truth Reset

Goal: stop stale docs from misleading future work.

Tasks:

- create `docs/README.md`
- create durable docs listed above
- rewrite stale app/package READMEs
- document Dodo Payments as the intended billing provider and call out existing Polar references as alpha code to replace
- add local ownership docs for key apps/packages
- document current alpha limitations separately from planned architecture

Acceptance:

- no README says "implementation pending" for implemented code
- API docs say Hono, not Fastify
- docs identify what is implemented versus planned

### Phase 1: Package Boundary Setup

Goal: establish pure contract packages before feature work.

Tasks:

- add `packages/events`
- add `packages/storage-paths`
- add `packages/style-spec`
- add `packages/logger`
- optionally add `packages/api-client`
- add `vitest.workspace.ts`

Acceptance:

- packages have exports, tests, and local docs
- no package imports service clients unless it is supposed to
- existing API/style helpers begin moving into shared packages

### Phase 2: Database and Resource Model Reset

Goal: define the schema Planisfy can grow on.

Tasks:

- reset schema around `accounts`
- rename Better Auth OAuth table to `oauth_accounts`
- add uploads/datasets/tilesets/style publication/jobs/storage/outbox tables
- add billing customer/subscription/transaction tables for future Dodo integration
- remove or replace Polar-specific billing assumptions in API/UI code
- add soft-delete-aware unique indexes
- add relations
- add seed data strategy

Acceptance:

- schema expresses the target resource model
- publishing/versioning has real tables
- jobs and events are durable
- old alpha-only tables are removed or deliberately mapped

### Phase 3: Async and Storage Backbone

Goal: replace direct queue/storage shortcuts with durable contracts.

Tasks:

- implement outbox helper
- implement processing job helper
- implement storage ledger
- implement local storage provider through storage paths
- implement S3/R2-compatible provider
- update upload routes to create storage/job/outbox records

Acceptance:

- API does not enqueue durable geodata work directly to BullMQ
- every storage object has a ledger row
- upload/job state survives API, Redis, and worker restarts

### Phase 4: Worker Split

Goal: move heavy processing out of API.

Tasks:

- add `apps/worker-geodata`
- move source processing worker logic there
- add GDAL/Tippecanoe/DuckDB tooling to worker image
- implement event claiming/handling
- implement job log persistence
- add geodata worker health checks

Acceptance:

- API image is lighter
- worker can process GeoJSON/CSV/PMTiles via outbox
- job failures are visible and actionable
- tests cover event validation and failure paths

### Phase 5: Frontend and API DX

Goal: make console/admin consume stable backend contracts.

Tasks:

- add typed API client
- update console/admin calls
- move style mutation rules to `packages/style-spec`
- add job/log UI surfaces
- align source/tileset/studio UI with new resource model

Acceptance:

- console does not duplicate publish/version business logic
- Studio can show jobs, versions, and errors clearly
- admin can inspect jobs, storage objects, usage, and health

### Phase 6: Self-Host Product Proof

Goal: make the stronger foundation visible to users.

Tasks:

- update Docker Compose with PostGIS and worker-geodata
- seed bootstrap account
- seed demo style/source/tiles
- add setup script
- add health checks
- add Docker smoke test

Acceptance:

- `docker compose up` starts the product stack
- console shows a real map
- health includes API, DB, Redis, Martin, Valhalla, and worker-geodata
- docs let a new developer complete setup without hidden tribal knowledge

## Recommended Order Relative To Product Roadmap

Do this restructuring before Milestone 1 if possible.

Minimum foundation before roadmap execution:

1. Documentation and truth reset
2. `events`, `storage-paths`, `style-spec`
3. database/resource model reset
4. outbox/jobs/storage backbone
5. worker-geodata split
6. test workspace

Then resume the product roadmap:

1. self-host demo
2. global basemap
3. upload-to-tileset
4. Studio workflow
5. publishing/versioning/rollback

## Risks

### Over-Engineering

The risk is copying Geobble's complexity rather than its discipline.

Mitigation:

- keep Planisfy resource types focused
- avoid CRDT/AI/credits/social features
- prefer simple self-host paths
- add packages only when they define durable contracts

### Longer Time Before Visible Features

The restructuring delays obvious product progress.

Mitigation:

- keep each phase shippable
- ensure Phase 6 creates a better self-host demo
- use regional fixtures for tests while keeping global basemap as release target

### Heavier Runtime

PostGIS, worker containers, GDAL, Tippecanoe, and DuckDB add operational weight.

Mitigation:

- keep heavy tools out of API
- make worker-geodata optional only where possible, but required for uploads/builds
- document resource sizing
- keep demo data small

## Final Recommendation

Planisfy should restructure before executing the main roadmap.

The best version of Planisfy is not a smaller Geobble. It is a focused self-hostable maps platform with Geobble-grade engineering contracts underneath it.

This restructuring is worth doing because Planisfy's roadmap depends on durable artifacts, reliable jobs, stable publishing, and trustworthy self-hosting. Those are foundation concerns, not feature polish.
