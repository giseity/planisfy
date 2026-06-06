# Planisfy Roadmap

This is the canonical planning document for work still left to do. Durable
implementation details belong in `ARCHITECTURE.md` and `docs/`.

## Product Thesis

Planisfy should become the open, self-hostable Mapbox alternative, with hosted
cloud when teams want convenience.

The focused promise is:

> Own your maps, style your data, deploy anywhere.

The core product loop remains:

```text
Source data -> Dataset/import -> Tileset build -> Style -> Publish -> Observe
```

## Current Alpha Assessment

Planisfy is still alpha, but no longer "paper alpha." The platform foundation,
Console workflows, processing jobs, storage ledger, execution-target model, and
operations surface are real. The remaining alpha risk is mostly about
production confidence: first-run setup, default map quality, restart-safe
processing, larger imports, operational docs, and end-to-end browser coverage.

Call it an early product alpha:

- Strong enough for development, demos, and guided self-host trials.
- Not yet strong enough for a new team to self-host independently and trust it
  for production maps without hands-on support.
- Not yet a beta until the self-hosted loop is repeatable from README alone and
  the default basemap, upload/import, publish, observe, backup, and upgrade
  paths are proven end to end.

## Current Invariants

- Keep `apps/console/next-env.d.ts` out of commits when it appears as a local
  generated modification.
- Keep binary PMTiles, MBTiles, Valhalla graphs, and large source extracts out
  of git.
- Preserve existing public route names, style URLs, TileJSON URLs, auth
  contracts, and account/profile compatibility aliases unless a migration is
  explicitly planned.
- Keep the toolchain split: Tippecanoe/GDAL for user uploads, DuckDB for source
  imports, and Planetiler for basemap/regional release builds.
- Prefer small logical commits with focused checks after each task group.

## Self-Hosted v1 Remaining

These are the blockers between the current alpha and a credible self-hosted v1.

### 1. First-Run Self-Host Demo

Goal: `docker compose up` plus documented setup commands should produce a useful
first-run product without manual data hunting.

Remaining work:

- Make `scripts/self-host-setup.sh` and README commands produce a visible demo
  map with aligned seeded styles, source metadata, Martin PMTiles aliases,
  layer IDs, and Console URLs.
- Make missing demo data, missing writable storage directories, or missing
  optional runtime inputs fail with clear setup guidance.
- Confirm bootstrap account creation, migrations, health checks, and demo data
  setup work from README alone.
- Add or update Docker Compose smoke coverage for the complete first-run path.

### 2. Default Basemap v1

Goal: ship one attractive, reliable Planisfy basemap release.

Remaining work:

- Produce a small but polished `planisfy-streets-v1` regional release using the
  Planetiler harness under `@planisfy/map-styles`.
- Keep the source-layer contract explicit and tested for roads, places,
  boundaries, water, landuse, buildings, and every rendered layer.
- Generate or validate light and dark styles against the same release manifest.
- Document how self-host users obtain or build the PMTiles artifact without
  committing binaries to the repository.
- Add visual/browser checks that the default map renders non-empty tiles.

### 3. Upload Processing Hardening

Goal: user uploads should produce reliable, served tilesets across normal
failure and restart scenarios.

Remaining work:

- Prove GeoJSON, CSV, zipped Shapefile, PMTiles, and MBTiles upload paths serve
  tilesets after API, Redis, and worker restarts.
- Tighten validation for size, extension, MIME hints, filename safety, geometry
  detection, bounds, schema summaries, and user-facing failure messages.
- Ensure retry, cancel, rebuild, and version promotion state remains consistent
  in Console, Admin, jobs, logs, storage objects, and outbox events.
- Add smoke or integration coverage for uploaded tiles resolving through
  Martin/TileJSON after publication.

### 4. Overture And Source Imports

Goal: users should import Overture data for a saved region without hand-written
scripts and review the cost/risk before expensive work starts.

Remaining work:

- Add region sizing previews and clearer duration/cost estimates before large
  imports.
- Harden remote import SSRF/egress controls and credential audit behavior.
- Add larger-import safeguards: timeouts, row/feature limits, temp-space checks,
  cancellation checkpoints, and cleanup after failed jobs.
- Expand DuckDB execution beyond the current configured Overture path only after
  logs, artifacts, provenance, bounds/count metadata, and failure modes remain
  reliable.
- Add missing Overture theme/type pairs only when the worker can process them
  honestly.

### 5. Console And Studio Workflow Confidence

Goal: the Console path from data to published map should be obvious without
depending on Admin pages.

Remaining work:

- Make upload/import -> tileset build -> artifact review -> Studio add-source
  -> publish feel like a single guided workflow.
- Keep Studio source IDs, layer IDs, source-layer selection, duplicate
  protection, and generated layer defaults stable and tested.
- Improve empty, loading, failed, retrying, cancelled, and succeeded states for
  jobs, imports, tilesets, previews, and artifacts.
- Add browser-level coverage for adding an uploaded/imported tileset, publishing
  a style, copying URLs, and loading the published style in a MapLibre example.

### 6. Publishing, Rollback, And Rebuild Safety

Goal: production maps should be safe to change.

Remaining work:

- Verify draft edits cannot mutate already published style artifacts.
- Make style version restore and tileset version promotion visible in both
  Console and Admin.
- Record rebuild/promote inputs, outputs, actor, warnings, artifacts, and alias
  registration results in job/audit structures.
- Add regression tests around published URL stability after draft edits,
  rollback, rebuild, and alias re-registration.

### 7. Operations Productization

Goal: jobs, schedules, notifications, workers, backups, previews, domains, and
templates should become dependable operations features rather than only Console
primitives.

Remaining work:

- Dispatch scheduled operations automatically through the queue/outbox path.
- Deliver job and schedule notifications from worker/API events, not only manual
  test sends.
- Add notification adapters for email, Slack, and Discord.
- Add backup/restore docs and tests for Postgres, local storage, PMTiles
  artifacts, and any Redis/job-state assumptions.
- Add upgrade guidance for migrations, storage layout, worker compatibility, and
  basemap release changes.
- Improve Admin and Console health pages for storage, Martin, Valhalla,
  worker-geodata, queues, outbox lag, execution targets, worker profiles, and
  toolchain capabilities.
- Replace raw usage-log dashboard queries with rollups or retention-aware
  summaries where scale matters.
- Add support-bundle style exports for logs, health, configuration, and recent
  job state.

### 8. Documentation And Test Truth Pass

Goal: docs and tests should match the implemented product, not the intended one.

Remaining work:

- Keep README, self-hosting docs, API docs, security docs, storage docs,
  operations docs, and architecture docs aligned with current behavior.
- Remove stale placeholder screenshots/examples from docs or mark them clearly
  as examples.
- Add CI coverage for lint, typecheck, tests, builds, Docker image matrix builds,
  and Compose smoke checks.
- Add worker tests for success, failure, retry, cancellation, and restart
  behavior.
- Add Studio tests for add-source, create-layer, publish, rollback, and preview.

## Managed And Cloud Remaining

These should stay behind the credible self-hosted v1 loop unless a paying
deployment requires a narrow slice sooner.

### 1. Hosted Runtime Platform

- Define deployable environments for API, Console, Admin, workers, Postgres,
  Redis, object storage, Martin/tile serving, CDN, observability, secrets, and
  migrations.
- Add release promotion, preview deployment, rollback, and environment
  configuration practices for Planisfy Cloud.
- Add abuse controls for signups, API keys, tile requests, uploads, imports,
  storage growth, and worker CPU/runtime.

### 2. Managed Tile Delivery

- Implement the planned Cloudflare/R2 tile worker or equivalent CDN edge layer.
- Add cache purge, immutable artifact caching, edge usage metering, and clear
  behavior for private/public tilesets.
- Keep MapLibre-compatible style, TileJSON, glyph, sprite, and tile URLs stable
  across managed and self-hosted deployments.

### 3. Managed Data Products

- Automate managed basemap releases from Planetiler with provenance,
  attribution, QA checks, changelogs, and versioned manifests.
- Build managed Overture regional extracts with scheduled refreshes,
  customer-selectable regions/themes, and artifact/version retention.
- Decide which premium data packages are open-core compatible, hosted-only, or
  commercial-license-only.

### 4. Billing And Metering Productionization

- Wire the Dodo Payments-oriented schema/UI to real subscription lifecycle,
  webhook verification, invoices, plan changes, cancellations, trials, and
  failed-payment states.
- Enforce quotas consistently across API requests, tile delivery, uploads,
  imports, storage, and worker runtime.
- Add customer-visible usage breakdowns that match billable units.

### 5. Enterprise, Hybrid, And Governance

- Add SSO, SCIM, advanced RBAC, approval workflows, audit export, long-retention
  logs, and private-cloud/Helm packaging.
- Add advanced Studio collaboration only after the single-user/org workflow is
  reliable.
- Define commercial-license and proprietary module boundaries for enterprise and
  cloud-only work.

## Suggested Execution Order

1. Finish the first-run self-host demo and visible default map.
2. Ship the regional basemap v1 artifact flow.
3. Harden upload/import processing through restart and failure scenarios.
4. Add browser-level Console/Studio publish workflow tests.
5. Productize schedules, notifications, backups, health, and upgrade docs.
6. Start managed CDN, billing enforcement, and managed data release automation.
