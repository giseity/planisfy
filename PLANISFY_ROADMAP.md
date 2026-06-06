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
- Dodo Payments-oriented billing schema and UI/API surface, disabled unless
  credentials are configured.

Partial:

- Self-host setup creates directories and fixture styles, but does not yet feel
  one-command complete.
- Default basemap is a fixture style and manifest, not a generated Planisfy
  basemap release.
- Upload processing exists, but job detail, retry/cancel UX, schema review,
  bounds review, and one-click rebuild need polish.
- Tileset versioning/promotion exists, but rollback and version management UX
  are thin.
- Studio is real, but adding uploaded tilesets to styles is not yet a polished
  visual source/layer workflow.
- Usage dashboards still query raw logs in places; rollups and retention are not
  productionized.
- Static maps need an external render service.
- Geocoding and routing runtimes are wired, but production data/index/graph
  pipelines remain external.
- Cloudflare/R2 tile worker is planned but not implemented.
- Docs still need regular truth passes as implementation status changes.

Planned:

- Remote data sources and credential storage.
- Saved regions and region-aware processing.
- DuckDB-first import/query pipeline.
- Planetiler-based basemap generation.
- Overture-first basemap and data workflows.
- Preview deployments, webhooks, scheduled imports, cache purge, environments,
  and managed/hybrid data packages.

Immediate foundation chores:

- Keep repository license and data attribution policy current as package-level
  license carve-outs and basemap releases evolve.
- Keep CI for lint, typecheck, tests, builds, and Docker image matrix builds
  healthy.
- Expand core API and Docker Compose smoke tests beyond the current health,
  metrics, auth-protection, and minimum Compose boot checks.
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

Status: Planned, with fixture assets already present.

Goal: ship one attractive, reliable Planisfy basemap.

Practical order:

1. Ship a working regional fixture first.
2. Make the source-layer schema explicit and tested.
3. Add reproducible regional build.
4. Add global Overture/Natural Earth build once the smaller loop works.

Acceptance:

- `planisfy-streets-v1` vector tileset exists as a versioned release artifact.
- Light and dark styles render from the same documented source-layer schema.
- Release manifest records attribution and source versions.
- Self-host users can use the basemap without hidden data hunting.

#### Milestone 3: Sources, Credentials, Regions, Imports, And DuckDB

Status: Planned.

Goal: users can get data from places other than local files and turn it into
inspectable datasets and tilesets.

Acceptance:

- A user can import an Overture theme for a region without hand-written scripts.
- Import results become dataset versions with schema, bounds, counts, and
  provenance.
- Credentials are server-only, encrypted at rest, and audited.
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
