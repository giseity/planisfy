# Planisfy Roadmap

This is the canonical planning document for Planisfy. Durable implementation
details belong in `ARCHITECTURE.md` and `docs/`.

The roadmap should stay small enough to answer:

- Where is Planisfy today?
- What product line are we trying to defend?
- What work matters next?

## Product Thesis

Planisfy should become the open, self-hostable Mapbox alternative, with hosted
cloud when teams want convenience.

The focused promise is:

> Own your maps, style your data, deploy anywhere.

The first durable identity is a complete, self-hostable maps platform for custom
geospatial data:

- polished default basemap
- custom uploads, imports, and tiling
- visual Studio workflows
- MapLibre-compatible delivery
- reliable self-host deployment
- optional hosted cloud and managed data updates

The core product loop is:

```text
Source data -> Dataset/import -> Tileset build -> Style -> Publish -> Observe
```

## Status Vocabulary

- Done: implemented and usable without hidden manual work beyond documented
  configuration.
- Partial: implementation exists, but important product, reliability, docs, or
  operational gaps remain.
- Planned: no meaningful implementation yet.
- Experimental: useful direction, but not ready to promise as stable product
  behavior.

## Current Reality

Planisfy is in alpha. The foundation is real, but the self-hosted product loop
is not yet credible end to end for a new user.

Done or close:

- TypeScript monorepo with API, console, admin, docs, marketing, workers, and
  shared packages.
- Hono API gateway with public map API route groups.
- Better Auth sessions, organization support, and account ownership model.
- API keys with hashing, scopes, allowed domains, rate limits, quotas, and usage
  logging.
- Drizzle schema for the current account/resource/job/storage/billing model.
- Style CRUD, validation, version history, publish, restore, duplicate, soft
  delete, and public style routes.
- Console surfaces for dashboard, styles, Studio, API keys, usage, billing
  settings, and tileset upload.
- Admin surfaces for users, orgs, keys, usage, audit, artifacts, outbox,
  failures, health, jobs, and job detail.
- Docker Compose wiring for app services, Postgres, Redis, Martin, Valhalla,
  worker-geodata, and local artifact storage.
- Local/S3/R2-compatible storage abstraction plus storage ledger writes.
- Durable outbox events and BullMQ-based geodata worker dispatch.
- Upload-to-tileset path for GeoJSON, CSV, zipped Shapefile, PMTiles, and
  MBTiles.
- Basic Valhalla proxy endpoints.
- Health, detailed health, and Prometheus-style metrics endpoints.
- Docker Compose smoke coverage for API readiness and detailed runtime checks.
- Dodo Payments-oriented billing schema and UI/API surface, disabled unless
  credentials are configured.

Partial:

- Self-host setup creates directories and fixture styles, but does not yet feel
  one-command complete.
- Default basemap is a fixture style and manifest, with a Planetiler regional
  harness but not a polished generated global Planisfy basemap release.
- Upload processing exists with job progress, retry/cancel controls,
  validation summaries, artifact links, and rebuild from original uploads.
- Tileset version promotion exists with Console rollback affordances, though
  broader Admin/operator version management can still improve.
- Studio can add published uploaded tilesets without JSON edits, including
  source-layer selection and draft/published URL copy flows.
- Saved regions, source credentials, source connections, and Overture import
  job records exist; the worker runs DuckDB extraction when `OVERTURE_RELEASE`
  is configured and records dataset versions, schema, bounds, counts, warnings,
  artifacts, and provenance.
- The geodata toolchain split is explicit: Tippecanoe/GDAL for uploads, DuckDB
  for imports, and Planetiler for regional basemap release builds.
- Usage dashboards still query raw logs in places; rollups and retention are not
  productionized.
- Static maps need an external render service.
- Geocoding and routing runtimes are wired, but production data/index/graph
  pipelines remain external.
- Cloudflare/R2 tile worker is planned but not implemented.
- Docs still need regular truth passes as implementation status changes.

Planned:

- Broader DuckDB-first import/query execution.
- Global Planetiler-based basemap generation.
- Overture-first basemap and data workflows.
- Preview deployments, webhooks, scheduled imports, cache purge, environments,
  and managed/hybrid data packages.

Immediate foundation chores:

- Keep repository license and data attribution policy current as package-level
  license carve-outs and basemap releases evolve.
- Keep CI for lint, typecheck, tests, builds, and Docker image matrix builds
  healthy.
- Keep core API and Docker Compose smoke tests aligned with health, metrics,
  auth protection, storage, worker, Martin, and Valhalla readiness behavior.
- Clean up stale docs/status mismatches as milestones move.
- Finish account/profiles terminology cleanup where safe.

## Credible v1 Gate

Planisfy v1 is credible only when a team can:

1. Self-host the stack from documented commands.
2. See a polished default basemap immediately.
3. Upload a GeoJSON or CSV file.
4. Import Overture data for a region without hand-written scripts.
5. Process data into a tileset with visible job progress and logs.
6. Style uploaded/imported data visually in Studio.
7. Publish stable style and TileJSON URLs.
8. Use those URLs in MapLibre.
9. Roll back style or tileset changes.
10. Inspect usage, processing logs, artifacts, and service health.
11. Upgrade the deployment without losing data.

Milestones 1-6 serve this gate. Later milestones should not pull focus until the
loop works end to end.

## Fresh-Context Backlog

This section is intentionally more explicit than the strategic roadmap. A fresh
conversation should be able to start here, inspect the named areas, and continue
without rediscovering the product state from scratch.

Current invariants:

- Keep `apps/console/next-env.d.ts` out of commits when it appears as a local
  generated modification.
- Keep binary PMTiles, MBTiles, Valhalla graphs, and large source extracts out
  of git.
- Preserve existing public route names, style URLs, TileJSON URLs, auth
  contracts, and account/profile compatibility aliases unless a migration is
  explicitly planned.
- Keep the toolchain split: Tippecanoe/GDAL for user uploads, DuckDB for source
  imports, Planetiler for basemap/regional release builds.
- Prefer small logical commits with focused checks after each task group.

Self-hosted v1 tasks remaining:

1. Demo bootstrap polish.
   - Make `scripts/self-host-setup.sh` plus documented compose commands produce
     a useful first-run demo without manual data hunting.
   - Verify seeded styles, source metadata, Martin PMTiles paths, layer IDs, and
     Console URLs agree.
   - Make missing demo data, missing writable storage directories, or missing
     optional runtime inputs fail with clear setup guidance.
   - Confirm bootstrap account creation works from README alone.

2. Default basemap v1.
   - Produce a small but attractive `planisfy-streets-v1` regional release using
     the Planetiler harness under `@planisfy/map-styles`.
   - Keep the source-layer contract explicit and tested for roads, places,
     boundaries, water, landuse, buildings, and any other rendered layers.
   - Generate or validate light and dark styles against the same release
     manifest.
   - Document how self-host users obtain or build the PMTiles artifact without
     committing the binary to the repository.

3. Upload processing hardening.
   - Prove GeoJSON, CSV, zipped Shapefile, PMTiles, and MBTiles upload paths
     produce served tilesets across API, Redis, and worker restarts.
   - Tighten validation for size, extension, MIME hints, filename safety,
     geometry detection, bounds, schema summaries, and useful user-facing
     failure messages.
   - Ensure retry, cancel, rebuild, and version promotion state is durable and
     reflected consistently in Console and Admin.
   - Add focused smoke or integration coverage for uploaded tiles resolving
     through Martin/TileJSON after publication.

4. Overture/source imports.
   - Keep the current Overture catalog as the stable UI/API vocabulary, then add
     missing theme/type pairs only when the worker can handle them honestly.
   - Add previews and clearer region sizing estimates before expensive imports.
   - Harden remote import SSRF/egress controls and credential audit behavior.
   - Expand DuckDB execution beyond the current configured Overture path only
     after failure modes, logs, artifacts, provenance, and bounds/count metadata
     remain reliable.
   - Add larger-import safeguards: timeouts, row/feature limits, temp-space
     checks, cancellation checkpoints, and cleanup after failed jobs.

5. Console and Studio workflow confidence.
   - Make the Console path from upload/import to tileset build to artifact review
     obvious without relying on Admin pages.
   - Keep Studio source IDs, layer IDs, source-layer selection, duplicate
     protection, and generated layer defaults stable and tested.
   - Add browser-level coverage for adding an uploaded/imported tileset,
     publishing a style, copying URLs, and loading the published style in a
     MapLibre example.
   - Improve empty, loading, failed, retrying, cancelled, and succeeded states
     for jobs and tilesets.

6. Publishing, rollback, and rebuild safety.
   - Verify draft edits cannot mutate already published style artifacts.
   - Make style version restore and tileset version promotion visible in both
     Console and Admin.
   - Record rebuild/promote inputs, outputs, actor, warnings, artifacts, and
     alias registration results in existing job/audit structures.
   - Add regression tests around published URL stability after draft edits,
     rollback, rebuild, and alias re-registration.

7. Self-host operations.
   - Add documented backup and restore for Postgres, Redis/job state where
     needed, local storage, and PMTiles artifacts.
   - Add upgrade guidance for migrations, storage layout, worker compatibility,
     and basemap release changes.
   - Improve health and Admin status pages so storage, Martin, Valhalla,
     worker-geodata, queues, outbox lag, and toolchain capabilities are easy to
     diagnose.
   - Replace raw usage-log dashboard queries with rollups or retention-aware
     summaries where scale matters.

Managed/cloud tasks remaining:

1. Hosted runtime platform.
   - Define deployable environments for API, Console, Admin, workers, Postgres,
     Redis, object storage, Martin/tile serving, CDN, observability, secrets,
     and migrations.
   - Add release promotion, preview deployment, rollback, and environment
     configuration practices for Planisfy Cloud.
   - Add abuse controls for signups, API keys, tile requests, uploads, imports,
     storage growth, and worker CPU/runtime.

2. Managed tile delivery.
   - Implement the planned Cloudflare/R2 tile worker or equivalent CDN edge
     layer.
   - Add cache purge, immutable artifact caching, usage metering at the edge,
     and clear behavior for private/public tilesets.
   - Keep MapLibre-compatible style, TileJSON, glyph, sprite, and tile URLs
     stable across managed and self-hosted deployments.

3. Managed data products.
   - Automate managed basemap releases from Planetiler with provenance,
     attribution, QA checks, changelogs, and versioned manifests.
   - Build managed Overture regional extracts with scheduled refreshes,
     customer-selectable regions/themes, and artifact/version retention.
   - Decide which premium data packages are open-core compatible, hosted-only,
     or commercial-license-only.

4. Billing and metering productionization.
   - Wire the Dodo Payments-oriented schema/UI to real subscription lifecycle,
     webhook verification, invoices, plan changes, cancellations, trials, and
     failed-payment states.
   - Enforce quotas consistently across API requests, tile delivery, uploads,
     imports, storage, and worker runtime.
   - Add customer-visible usage breakdowns that match billable units.

5. Collaboration and governance.
   - Add advanced Studio collaboration only after the single-user/org workflow is
     reliable.
   - Plan SSO, SCIM, advanced RBAC, approval workflows, audit export,
     long-retention logs, and private-cloud/Helm packaging as enterprise work.
   - Keep these behind the credible self-hosted v1 loop unless a paying managed
     deployment requires a narrow slice sooner.

Suggested execution order from here:

1. Finish self-hosted demo bootstrap and visible default map.
2. Ship the regional basemap v1 artifact flow.
3. Harden upload/import processing through restart and failure scenarios.
4. Add browser-level Console/Studio publish workflow tests.
5. Add backup/restore/upgrade docs and checks.
6. Only then start managed CDN, billing enforcement, and managed data release
   automation.

## Strategic Boundaries

### Open Core

The open core should be useful enough that a developer, GIS team, civic project,
or small company can run Planisfy successfully.

Open:

- Hono API gateway
- self-host Docker stack
- basic auth, orgs, and API keys
- basic Studio
- style serving
- file uploads and local processing
- local usage logs
- local/S3/R2-compatible storage providers
- Martin and Valhalla integration points
- MapLibre-compatible examples
- documented extension points
- basic DuckDB/Planetiler/Tippecanoe pipelines where practical

### Commercial And Cloud

Paid value should come from operations, managed infrastructure, governance,
premium data, and support rather than artificial product crippling.

Paid:

- Planisfy Cloud hosted APIs
- managed CDN tile delivery and cache purge
- managed basemap releases
- managed Overture data releases and regional extracts
- hosted custom tileset processing
- hosted DuckDB-backed import workbench for large data
- Dodo Payments-backed billing and subscription management
- advanced Studio collaboration
- SSO, SCIM, advanced RBAC
- long-retention audit logs
- approvals and publishing workflows
- Helm/Kubernetes/private-cloud tooling
- premium data packages
- Valhalla graph subscriptions
- SLAs, support, compliance reviews

### Not Now

Avoid these until the maps/custom-data loop is credible:

- full Mapbox product parity
- production search beyond clear Pelias-compatible integration
- navigation graph build products beyond Valhalla runtime integration
- enterprise governance
- mobile/offline SDKs
- hosted cloud infrastructure
- complex collaboration workflows

## Licensing Direction

Recommended model:

- AGPLv3 for core server/platform code where network-service reciprocity matters.
- Permissive licensing for developer-facing SDKs, examples, helpers, and
  integration snippets.
- Explicit data/style attribution terms for basemap styles, sprites, fonts, and
  release manifests.
- Commercial license for companies that need non-AGPL terms.
- Proprietary enterprise/cloud modules for managed and governance-heavy
  features.

A root AGPL-3.0-only license, notice file, and data attribution policy now
exist. Future SDKs, examples, helper packages, and enterprise/cloud modules
should carry explicit package-level license metadata when they diverge from the
core license.

## Engineering Principles

- Prefer MapLibre compatibility before Mapbox total parity.
- Build workflows end to end before expanding feature breadth.
- Treat the first credible product loop as a hard gate.
- Use immutable published artifacts for production maps.
- Keep draft/editing state separate from published URLs.
- Make self-hosting boring: predictable setup, health checks, backups, upgrades.
- Treat geodata processing as a first-class product surface.
- Design every long-running operation as a job with logs, retries, progress,
  cancellation, failure states, and artifact links.
- Keep provider boundaries clean: local disk first, S3/R2-compatible storage
  next, cloud-managed later.
- Use DuckDB for columnar geospatial import/extract work, especially Overture
  GeoParquet.
- Use Tippecanoe for simple custom vector uploads and Planetiler for basemaps,
  large repeatable tile builds, and Overture theme pipelines.
- Treat Overture as a privileged open-data source, not merely a docs example.

## Execution Focus

### Now

The immediate work should stay tight around a usable self-hosted v1 loop.

#### Milestone 1: Self-Hosted Demo That Works

Status: Partial.

Goal: `docker compose up` should produce a useful product with a visible map and
demo data.

Acceptance:

- Console shows at least one working map without manual data hunting.
- Seeded style, seeded source metadata, and sample tiles agree on URLs and layer
  names.
- Bootstrap account creation is documented and repeatable.
- API health reports Postgres, Redis, Martin, Valhalla, worker-geodata, and
  storage state.
- New developers can complete setup from README alone.
- The demo remains useful without routing, geocoding, billing, email, or cloud
  storage configured.

#### Milestone 4: Custom Uploads And Processing

Status: Partial.

Goal: users can upload their own geodata and publish it as tiles.

Acceptance:

- GeoJSON and CSV upload can produce a served tileset without manual database or
  filesystem edits.
- Jobs show progress, logs, useful errors, retry, cancel, and rerun.
- Schema and bounds are reviewable before build/publish.
- Job state survives API, Redis, and worker restarts.
- Generated artifacts are visible in Admin and tied to resources.

#### Milestone 5: Studio Workflow v1

Status: Partial.

Goal: Studio should complete the core workflow: upload/import data, add it to a
style, publish it, and use it in MapLibre.

Acceptance:

- A user can add an uploaded tileset to a style without editing JSON by hand.
- Studio can create layers from tileset metadata.
- Studio shows draft versus published state clearly.
- Published style URLs resolve stable source URLs.
- A MapLibre app can load the published style.

#### Milestone 6: Publishing, Versioning, Rollback, And Rebuilds

Status: Partial.

Goal: production maps should be safe.

Acceptance:

- Published URLs do not break when drafts change.
- Users can roll back a bad style or tileset version.
- Rebuilds record inputs, outputs, warnings, and artifacts.
- Version state is visible in Console and Admin.

### Next

After the core loop is usable, add the data model that makes Planisfy more than
a file uploader.

#### Milestone 2: Default Basemap v1

Status: Partial, with fixture assets, manifest/contract tests, and a Planetiler
regional build harness present.

Goal: ship one attractive, reliable Planisfy basemap.

Practical order:

1. Ship a working regional fixture first.
2. Keep the source-layer schema explicit and tested.
3. Harden the reproducible regional Planetiler build.
4. Add global Overture/Natural Earth build once the smaller loop works.

Acceptance:

- `planisfy-streets-v1` vector tileset exists as a versioned release artifact.
- Light and dark styles render from the same documented source-layer schema.
- Release manifest records attribution and source versions.
- Self-host users can use the basemap without hidden data hunting.

#### Milestone 3: Sources, Credentials, Regions, Imports, And DuckDB

Status: Partial.

Goal: users can get data from places other than local files and turn it into
inspectable datasets and tilesets.

Acceptance:

- A user can request an Overture theme import for a saved region without
  hand-written scripts.
- Import requests create datasets, source import records, processing jobs, and
  provenance metadata.
- Credentials are represented as server-only encrypted payload records.
- DuckDB execution turns configured Overture imports into extracted dataset
  versions with schema, bounds, counts, warnings, artifacts, and provenance;
  additional providers, larger imports, previews, and production hardening
  remain.
- Remote import paths include SSRF and egress controls.

### Later

These are valuable, but should stay behind the credible v1 loop.

| Milestone | Status | Purpose |
| --- | --- | --- |
| 7: Maps API Compatibility | Partial | Cover migration-critical style, tile, sprite, glyph, static image, and tilequery behavior. |
| 8: Operational Productization | Partial | Make health, jobs, logs, storage, usage, backups, upgrades, and support bundles trustworthy. |
| 9: Overture, Planetiler, Managed Data | Planned | Make Overture regional extracts, basemap builds, and managed data packages a product advantage. |
| 10: Search And Navigation | Partial/Planned | Add production geocoding and routing graph pipelines after core maps are credible. |
| 11: Planisfy Cloud | Partial/Planned | Add hosted APIs, storage, CDN, workers, billing sync, usage, and abuse controls. |
| 12: Enterprise And Hybrid | Planned | Add SSO, SCIM, RBAC, audit export, approvals, private cloud, Helm, and managed data subscriptions. |

## Resource Model Reference

The canonical owner anchor is `accounts`. New code should use account language
rather than reviving older `profiles` naming, except where alpha compatibility
still exists.

The durable resource spine is:

```text
accounts
  -> sources / credentials / regions
  -> uploads / imports
  -> datasets / dataset_versions
  -> tilesets / tileset_versions
  -> styles / style_versions / style_publications
  -> processing_jobs / event_outbox / storage_objects
```

Keep detailed field definitions in `docs/resource-model.md`, event behavior in
`docs/events.md`, storage behavior in `docs/storage.md`, and operating behavior
in `docs/operations.md`.

## Cross-Cutting Gates

These are not separate product milestones. They are gates that affect whether a
milestone can honestly move to Done.

Documentation:

- Docs distinguish implemented behavior from target behavior.
- Commands in docs exist in this repo.
- Billing docs refer to Dodo Payments, not old providers.
- External runtime dependencies and fallback behavior are explicit.

Security:

- Upload validation covers size, type, filename, and content.
- Storage keys prevent path traversal.
- Remote imports include SSRF and egress controls.
- Credentials are encrypted, server-only, rotatable, and audited.
- Internal routes are protected in production-like configuration.

Reliability:

- Usage dashboards use rollups where needed.
- Jobs have persisted logs, retry/cancel/rerun, and restart-safe state.
- Backup, restore, and upgrade paths are documented and tested.
- Large builds record resource usage, warnings, and artifact metadata.

Testing:

- CI runs lint, typecheck, tests, and Docker builds.
- Core API smoke tests cover health, styles, tiles, uploads, jobs, and published
  URLs.
- Worker tests cover success, failure, retry, cancellation, and restart behavior.
- Studio tests cover add source, create layer, publish, and rollback.
