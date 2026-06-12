# Planisfy Roadmap

This document tracks what still needs to be proven before Planisfy can be
called dependable for self-hosted and managed v1 use. Durable implementation
details belong in `docs/`, `apps/docs/content/docs/`, and package READMEs; this
roadmap should stay focused on product readiness and remaining evidence gaps.

## Product Thesis

Planisfy should become the open Mapbox alternative with two first-class v1
paths:

- `self_host` for teams that want control of infrastructure and data.
- `managed` for teams that want convenience, hosted operations, and billing.

The focused promise remains:

> Own your maps, style your data, deploy anywhere.

The core loop is:

```text
Source data -> Dataset/import or upload -> Tileset build -> Style -> Publish -> Observe
```

## Current Baseline

These are no longer roadmap bets; they are implemented platform facts that docs
and tests should preserve:

- Deployment mode is explicit through `DEPLOYMENT_MODE=self_host|managed` and
  `@planisfy/platform-policy`.
- Console, Marketing, Docs, Admin, API, worker-geodata, Postgres, Redis,
  Martin, Valhalla, and optional MinIO/supervisor Compose services exist.
- Self-host setup creates local mount points, seeds fixture styles, validates
  source-layer contracts, and exposes `/setup/preflight`.
- API sessions, API keys, scopes, rate limits, usage logging, billing status,
  profile settings, and managed/self-host capability boundaries exist.
- Tileset uploads create storage objects, processing jobs, outbox events,
  worker builds, tile artifacts, rebuild/retry/cancel controls, and version
  promotion controls.
- Published uploaded tilesets are served through API-owned TileJSON and tile
  URLs. S3/R2/MinIO-backed uploads do not require Martin to expose matching
  source IDs.
- Public map assets under `/tiles/*`, `/styles/v1/*`, and `/fonts/*` can be
  read anonymously when published. Non-asset APIs still require API key/session
  auth.
- Published style state tracks the actual published version, not merely the
  latest draft version.
- Versioned TileJSON and style URLs are supported with inline `@version`
  aliases.
- Valhalla readiness is graph-aware: health/preflight submit a small route
  probe and report degraded when the service is up but no matching graph is
  mounted.
- Published TileJSON verifies the promoted PMTiles object before advertising
  tile URLs.
- Rebuild from original upload refuses early when the original upload artifact
  is missing.
- Retry dispatch removes stale terminal BullMQ jobs before re-adding work with
  the same processing job id.

## Current Invariants

- Keep `apps/console/next-env.d.ts` and `apps/marketing/next-env.d.ts` out of
  commits when they appear as local generated modifications.
- Keep binary PMTiles, MBTiles, Valhalla graphs, and large source extracts out
  of git.
- Preserve public style, TileJSON, tile, glyph, sprite, auth, and account route
  contracts unless a migration is explicitly planned.
- Use API-owned published tile URLs as the product contract for uploaded
  tilesets. Treat direct Martin source IDs as static/local deployment glue.
- Keep the toolchain split: Tippecanoe/GDAL for user uploads, DuckDB for source
  imports, and Planetiler for basemap/regional release builds.
- Prefer granular commits with focused tests or smoke checks.
- Do not mark a gate complete without evidence: unit tests, integration tests,
  browser checks, smoke scripts, docs, or an explicit manual QA record.

## Active QA Gates

### Gate 1 — Default Map And Basemap Artifact

**Promise:** A first-run self-host deployment can show a real default map, and
the basemap artifact/style contract is reproducible without committing binary
map data.

**Current state:** Fixture styles, source-layer contract tests, regional
release metadata, Planetiler regional build tooling, and a default-map smoke
script exist. When `stuttgart.pmtiles` is present, the smoke verifies the
PMTiles magic header, Martin TileJSON vector layers, and a non-empty Stuttgart
vector tile. Full browser-render proof still depends on a WebGL-capable browser
environment.

**Remaining evidence:**

- Keep release manifests tied to source data, attribution, SHA-256, layers, and
  style URLs.
- Replace the mutable local `stuttgart.pmtiles` fixture story with a polished
  default artifact source that new operators can obtain repeatably.
- Prove the default map renders in a browser QA environment with WebGL
  available.

### Gate 2 — Upload To Published Tileset

**Promise:** A user can upload supported data, build and publish a served
tileset, and understand failures before dead URLs leak to production.

**Current state:** Upload validation, smoke fixtures for GeoJSON, CSV, zipped
Shapefile, PMTiles, and MBTiles, worker builds, API-owned tile delivery,
published artifact checks, retry cleanup, rebuild guards, and public TileJSON
delivery are implemented for the core QA path.

**Remaining evidence:**

- Promote the upload-format smoke from validation coverage to API/worker
  integration coverage for GeoJSON, CSV, zipped Shapefile, PMTiles, and MBTiles.
- Exercise API, Redis, worker, and storage restarts during build/retry/cancel
  flows.
- Surface missing published artifacts and missing original uploads directly in
  Console/Operations, not only through API errors.
- Add browser coverage for retry, cancel, rebuild, promotion, and degraded
  artifact states.

### Gate 3 — Overture And Source Imports

**Promise:** A user can choose a saved region, review import size/risk, run a
source import, get a dataset artifact with provenance, and tile it without
hidden cost surprises.

**Current state:** Catalog validation, SSRF-oriented source URL policy,
DuckDB-backed import execution, and sizing estimates exist. Missing
`OVERTURE_RELEASE` is still too easy to discover only after queueing.

**Remaining evidence:**

- Block or clearly gate Overture import when required release configuration is
  missing.
- Add temp-space checks, cancellation checkpoints, cleanup assertions, and
  timeout coverage for long imports.
- Expand provenance assertions for feature counts, bounds, schema summaries,
  warnings, and source release details.
- Add end-to-end import -> dataset -> tileset -> publish coverage.

### Gate 4 — Console And Studio Browser Workflow

**Promise:** A non-admin user can complete the product loop in Console/Studio:
upload or import data, review artifacts, add a source, create layers, publish a
style, copy URLs, and load the published style in MapLibre.

**Current state:** The style editor panel layout and published-style version
state have been fixed. Manual QA has proven a clean uploaded tileset can be
added to a style and published to stable/versioned public URLs.

**Remaining evidence:**

- Add browser tests for upload/import -> Studio source -> layer -> publish.
- Add browser coverage for copied stable/versioned style and TileJSON URLs.
- Improve upload dialog required-field affordances so placeholders do not look
  like submitted defaults.
- Add accessibility names for ambiguous row actions in Operations/Delivery.

### Gate 5 — Publishing, Rollback, Rebuild, And URL Stability

**Promise:** Production map URLs are safe to change: draft edits do not mutate
published artifacts, rollbacks/promotions are visible, and stable/versioned URLs
remain trustworthy.

**Current state:** Style publication state, versioned style URLs, versioned
TileJSON, published asset auth, tileset promotion, audit metadata, object
storage alias registration, artifact checks, and rebuild guards exist.

**Remaining evidence:**

- Add API regression tests for published style immutability after draft edits.
- Add integration coverage for tileset promote, rollback, republish, rebuild,
  and URL stability.
- Add Console/browser coverage for version restore and tileset version
  promotion.
- Decide whether degraded/missing published artifacts should update tileset
  status in the database or remain request-time health signals.

### Gate 6 — Operations Readiness

**Promise:** Operators can observe, schedule, notify, back up, restore, upgrade,
diagnose, and support a self-hosted deployment without reverse-engineering
internal tables or logs.

**Current state:** Operations surfaces, schedules, notifications, backups,
restore, health, support bundle scripts, worker heartbeat, SSE operation
updates, Valhalla route readiness, and artifact sickness checks exist.

**Remaining evidence:**

- Wire automatic schedule dispatch beyond recording manual run requests.
- Deliver event-driven job/schedule notifications through webhook, Slack,
  Discord, email, and retry/failure paths.
- Fix backup creation UX/API validation so operators know what field failed.
- Add restore and upgrade smoke coverage for Postgres, Redis/job state, local
  storage, and object storage.
- Add queue/outbox lag and stuck-job reconciliation to Operations.
- Replace scale-sensitive raw usage dashboard queries with rollups or
  retention-aware summaries.

### Gate 7 — Documentation And CI Truth

**Promise:** Docs, examples, screenshots, scripts, and CI describe the product
that exists, not the product we intend to have later.

**Current state:** README, API tile docs, self-host storage docs, and Valhalla
readiness docs now reflect the current tile delivery and health contracts in the
core paths. Several public docs still read like future marketing copy.

**Remaining evidence:**

- Sweep API docs for auth truth: published assets vs key-protected service
  APIs.
- Remove or replace placeholder screenshots/images in quickstart and examples.
- Continue marking optional/external geocoding and legacy performance guidance
  clearly so default self-host setup is not confused with a full Pelias stack.
- Add CI lanes for typecheck, tests, builds, Docker image builds, Compose smoke,
  and optional browser QA.
- Add link/docs checks where practical.

## Managed V1 Gates

Managed v1 shares the same core resource, publishing, usage, and API-key model
as self-host, but requires hosted billing, email, storage, runtime, abuse
controls, and support boundaries.

### Managed Mode Boundary

- Keep customer-visible capabilities derived from `/setup/preflight`
  `capabilities[]`, not UI heuristics.
- Hide execution targets, worker profiles, supervisor controls, support bundles,
  and self-host upgrade affordances from managed customer Console views.
- Reject customer execution-target and worker-profile mutations with
  `CAPABILITY_UNAVAILABLE`.

### Managed Onboarding, Billing, And Email

- Start users on Free plan and allow Console browsing.
- Require verified email for managed API key creation/rotation.
- Cover Dodo checkout/webhook states without real network calls in fast tests.
- Require Resend for managed readiness while keeping self-host email optional.

### Managed Storage, Runtime, And Tile Delivery

- Block managed production readiness when R2 bucket, endpoint/account,
  credentials, or public URL are missing.
- Keep managed compute platform-operated for v1.
- Implement/prove the planned Cloudflare/R2 tile worker or equivalent CDN edge
  layer.
- Add cache purge, immutable artifact caching, edge usage metering, and clear
  behavior for public/private tilesets.

### Managed Data Products

- Automate managed basemap releases with provenance, attribution, QA checks,
  changelogs, and versioned manifests.
- Build managed Overture regional extracts with scheduled refreshes,
  customer-selectable regions/themes, and retention policy.
- Decide which premium data packages are open-core compatible, hosted-only, or
  commercial-license-only.

### Enterprise And Governance

- Add SSO, SCIM, advanced RBAC, approval workflows, audit export, long-retention
  logs, and private-cloud/Helm packaging after the single-org workflow is
  reliable.
- Define commercial-license and proprietary module boundaries before shipping
  enterprise-only modules.

## Suggested Execution Order

1. Finish docs truth pass for public API/self-host pages.
2. Add browser QA for Console/Studio publish and MapLibre load.
3. Add upload/restart/failure smoke for supported formats.
4. Fix Overture missing-release gating and import failure cleanup.
5. Finish Operations schedule/notification/backup readiness.
6. Add CI lanes for typecheck, tests, build, Docker image, Compose smoke, and
   optional browser QA.
7. Continue managed v1 boundaries, billing, email, R2, runtime, and tile-worker
   proof.
