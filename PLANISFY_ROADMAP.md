# Planisfy QA Roadmap

This is the canonical planning document for work still left to prove. Durable
implementation details belong in `ARCHITECTURE.md` and `docs/`. This roadmap is
organized around QA gates because Planisfy's next challenge is not discovering a
product loop; it is proving that loop is dependable across data, UI, publishing,
operations, docs, self-host delivery, and managed delivery.

## Product Thesis

Planisfy should become the open Mapbox alternative with two first-class v1
paths: self-host when teams want control, and managed when teams want
convenience.

The focused promise is:

> Own your maps, style your data, deploy anywhere.

The core product loop remains:

```text
Source data -> Dataset/import -> Tileset build -> Style -> Publish -> Observe
```

## Readiness Model

Use this roadmap to track product readiness by evidence, not labels. A gate is
complete only when the acceptance criteria are backed by repeatable checks,
docs, and known limitations.

Current reality:

- The guided self-host product loop is implemented: setup creates local mounts,
  seeded demo styles, Martin source aliases, and preflight checks needed to move
  from local data fixtures toward a published map flow.
- Planisfy is strong enough for development, demos, and guided self-host trials.
- Planisfy still needs QA hardening before a new team can self-host it from the
  README alone and trust it for production maps without hands-on support.
- V1 is ready when shared API/resource/publishing/usage flows are proven across
  both `self_host` and `managed`, while billing, email, storage, compute,
  support, and readiness boundaries stay explicit.

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
- Every QA gate should name the evidence that proves it: automated tests, smoke
  scripts, browser specs, screenshots, docs, or explicit manual checks.

## QA Gate 0 — Self-Host Product Loop

### User promise

A local operator can prepare a self-host environment, see what is missing, and
start the product loop without manual data hunting or hidden setup steps.

### Status

Complete enough to mark as implemented. Remaining work belongs to later gates:
default map quality, upload/import durability, browser proof, publishing safety,
operations, and docs truth.

### Acceptance criteria

- Setup creates local storage, PMTiles, Valhalla, style, fixture, and Martin
  source-alias directories.
- Setup seeds Planisfy Streets fixture styles into local storage.
- Setup validates style source URLs, source-layer contract, and Martin aliases.
- Setup reports whether the default PMTiles fixture is present and valid.
- A public read-only preflight exposes actionable first-run checks before sign-in.
- Compose smoke runs setup, starts core API dependencies, and asserts preflight
  and detailed health entries.
- README and self-hosting docs describe setup, health, preflight, PMTiles
  fixture handling, and first-account flow from the repository root.

### Evidence

- `scripts/self-host-setup.sh`
- `scripts/docker-compose-smoke.sh`
- `GET /setup/preflight`
- `apps/api/src/routes/setup.test.ts`
- `README.md`
- `docs/self-hosting.md`

## QA Gate 1 — Default Map And Basemap Artifact

### User promise

A first-run self-host deployment can show a real default map, and the basemap
artifact/style contract is explicit, reproducible, and testable without
committing binary map data.

### Status

In progress. The fixture style and regional build harness exist, but the default
map still needs visual/browser proof and a polished regional artifact flow.

### Acceptance criteria

- A small, polished `planisfy-streets-v1` regional release can be produced using
  the Planetiler harness under `@planisfy/map-styles`.
- The release manifest records source data versions, artifact metadata, SHA-256,
  attribution, style URL, and source-layer contract.
- Light and dark styles validate against the same release manifest.
- The source-layer contract covers roads, places, boundaries, water, landuse,
  buildings, and every rendered layer.
- Self-host docs explain how to obtain or build the PMTiles artifact while
  keeping binaries out of git.
- A visual/browser check proves the default map renders non-empty tiles.

### Required automated checks

- Manifest/schema tests for release metadata.
- Source-layer/style contract tests.
- Regional artifact builder tests that do not commit PMTiles.
- Browser or screenshot test for non-empty default map rendering.

### Remaining gaps

- Add visual/browser proof for non-empty default tiles.
- Finalize the polished regional artifact flow and docs for artifact sourcing.

## QA Gate 2 — Upload To Published Tileset

### User promise

A user can upload supported data, get clear validation feedback, build a
served tileset, publish it, and keep it available across normal restart and
failure scenarios.

### Status

In progress. Upload format policy, filename safety, worker validation, retry,
cancel, rebuild, promotion, and Martin alias primitives exist. Restart and
end-to-end served-tile proof still need broader smoke/integration coverage.

### Acceptance criteria

- GeoJSON, CSV, zipped Shapefile, PMTiles, and MBTiles uploads are accepted only
  when validation passes.
- Validation covers size, extension, MIME hints, filename safety, geometry,
  WGS84 bounds, schema summaries, and user-facing failure messages.
- Upload jobs remain coherent across API, Redis, and worker restarts.
- Retry, cancel, rebuild, and version promotion state remains consistent in
  Console, Admin, processing jobs, logs, storage objects, audit records, and
  outbox events.
- Published upload tiles resolve through Martin TileJSON and tile URLs.

### Required automated checks

- Unit tests for upload format policy and worker validation.
- Worker tests for success, failure, retry, cancellation, and restart recovery.
- API integration tests for job state transitions and audit/log output.
- Smoke or integration tests for Martin TileJSON/tile resolution after publish.

### Remaining gaps

- Prove all supported upload formats serve tiles after API/Redis/worker restarts.
- Add Martin/TileJSON smoke coverage for published upload artifacts.
- Expand restart/failure lifecycle coverage beyond fast unit tests.

## QA Gate 3 — Overture And Source Imports

### User promise

A user can choose a saved region, review import size/risk, run a source import,
get a dataset artifact with provenance, and tile it without hand-written scripts
or hidden cost surprises.

### Status

In progress. Catalog validation, SSRF-oriented source URL policy, DuckDB worker
path, and Overture sizing estimates exist. Larger-import safeguards and broader
failure cleanup evidence still need work.

### Acceptance criteria

- Overture requests require cataloged theme/type pairs unless experimental mode
  is explicitly enabled.
- Region sizing preview includes bbox validation, approximate area, duration
  estimate, risk level, warnings, and configured safeguards.
- Remote source URLs reject localhost, private ranges, metadata hosts,
  unsupported protocols, and credentialed URLs by default.
- Large imports enforce timeouts, row/feature limits, temp-space checks,
  cancellation checkpoints, and cleanup after failed jobs.
- Import artifacts record provenance, bounds, feature counts, schema summaries,
  warnings, and failure modes.
- New Overture theme/type pairs are added only when the worker can process them
  honestly.

### Required automated checks

- Catalog validation tests.
- Source URL policy tests.
- Import estimate tests.
- Worker tests for success, failure, timeout, cancellation, cleanup, and
  provenance output.
- Integration test for import -> dataset -> tileset -> publish.

### Remaining gaps

- Add temp-space checks and cancellation checkpoints inside long-running imports.
- Expand failure cleanup and provenance assertions.
- Add end-to-end import-to-published-tileset coverage.

## QA Gate 4 — Console And Studio Browser Workflow

### User promise

A non-admin user can complete the product loop in Console/Studio: upload or
import data, review artifacts, add a source, create layers, publish a style,
copy URLs, and load the published style in a MapLibre example.

### Status

In progress. Console helper tests cover source IDs, layer defaults, duplicate
layer IDs, publishability messaging, tileset state labels, and import gating.
Browser-level workflow proof is still missing.

### Acceptance criteria

- Upload/import -> tileset build -> artifact review -> Studio add-source ->
  publish feels like a single guided workflow.
- Studio source IDs, layer IDs, source-layer selection, duplicate protection,
  generated layer defaults, and publish URL normalization stay stable.
- Empty, loading, failed, retrying, cancelled, succeeded, and cancellation
  requested states are visible and actionable.
- Browser tests cover adding an uploaded/imported tileset, creating a layer,
  publishing a style, copying stable/versioned URLs, and loading the published
  style in a MapLibre example.

### Required automated checks

- Existing Console unit tests for source/import/tileset helpers.
- Browser tests for Studio add-source, create-layer, publish, rollback, and
  preview/load flows.
- Screenshot or visual checks for default map/source rendering where useful.

### Remaining gaps

- Add browser-level Console/Studio publish workflow tests.
- Add explicit browser coverage for MapLibre loading of published style URLs.

## QA Gate 5 — Publishing, Rollback, Rebuild, And URL Stability

### User promise

Production map URLs are safe to change: draft edits do not mutate published
artifacts, rollbacks and promotions are visible, and stable/versioned URLs keep
working after rebuilds and alias re-registration.

### Status

In progress. Style versions, restore/publish actions, tileset promotion, Martin
alias registration, and publish audit metadata exist. URL stability and draft
immutability need explicit regression coverage.

### Acceptance criteria

- Draft edits cannot mutate already published style artifacts.
- Style version restore and tileset version promotion are visible in Console and
  Admin.
- Rebuild/promote records inputs, outputs, actor, warnings, artifacts, previous
  version, target version, publish action, and alias registration results.
- Stable style and TileJSON URLs point to the promoted current version.
- Versioned style and TileJSON URLs remain immutable.
- Rollback, rebuild, and alias re-registration preserve URL stability.

### Required automated checks

- API regression tests for published style immutability after draft edits.
- API regression tests for tileset promote/rollback/republish audit metadata.
- Martin alias registration tests for stable and versioned aliases.
- Browser or integration tests for copying/loading stable and versioned URLs.

### Remaining gaps

- Add explicit style immutability and published URL stability tests.
- Add rebuild/rollback/alias re-registration integration coverage.

## QA Gate 6 — Operations Readiness

### User promise

Operators can observe, schedule, notify, back up, restore, upgrade, diagnose,
and support a self-hosted deployment without reverse-engineering internal tables
or logs.

### Status

In progress. Operations surfaces, schedules, notifications, backups, restore,
health, support bundle scripts, worker heartbeat, and notification adapter
payloads exist. Automatic dispatch/delivery and deeper restore/upgrade proof
remain.

### Acceptance criteria

- Scheduled operations dispatch automatically through queue/outbox paths.
- Job and schedule notifications are delivered from worker/API events, not only
  manual test sends.
- Email, Slack, Discord, and webhook notification adapters have clear payloads,
  delivery modes, and failure handling.
- Backup/restore docs and tests cover Postgres, local storage, PMTiles
  artifacts, and Redis/job-state assumptions.
- Upgrade docs cover migrations, storage layout, worker compatibility, and
  basemap release changes.
- Admin and Console health pages cover storage, Martin, Valhalla,
  worker-geodata, queues, outbox lag, execution targets, worker profiles, and
  toolchain capabilities.
- Usage dashboards rely on rollups or retention-aware summaries where scale
  matters.
- Support bundles export redacted logs, health, config, and recent job state.

### Required automated checks

- Schedule dispatch tests.
- Notification payload and delivery-mode tests.
- Backup/restore smoke tests.
- Health endpoint and support-bundle tests.
- Usage rollup tests.

### Remaining gaps

- Wire automatic schedule dispatch beyond manual run requests.
- Deliver event-driven job/schedule notifications.
- Add restore and upgrade smoke coverage.
- Replace scale-sensitive raw usage dashboard queries with rollups.

## QA Gate 7 — Documentation And CI Truth

### User promise

Docs, examples, screenshots, scripts, and CI describe the product that exists,
not the product we intend to have later.

### Status

In progress. README and self-hosting docs track the current self-host loop, but
platform-wide docs/CI truth still needs a dedicated sweep.

### Acceptance criteria

- README, self-hosting docs, API docs, security docs, storage docs, operations
  docs, and architecture docs match current behavior.
- Stale placeholder screenshots/examples are removed or clearly marked as
  examples.
- CI covers lint, typecheck, fast tests, builds, Docker image matrix builds, and
  Compose smoke checks.
- Worker lifecycle tests cover success, failure, retry, cancellation, and
  restart behavior.
- Studio tests cover add-source, create-layer, publish, rollback, and preview.

### Required automated checks

- CI workflow for lint, typecheck, tests, and builds.
- Docker/Compose smoke in CI or an explicitly documented opt-in lane.
- Worker lifecycle test suite.
- Studio browser test suite.
- Link/docs checks where practical.

### Remaining gaps

- Add missing CI lanes.
- Add worker lifecycle and Studio browser tests.
- Complete docs/screenshot/example truth pass.

## Managed V1 QA Gates

Managed v1 ships beside self-host v1. It shares the same core resource,
publishing, usage, and API-key model, but requires Dodo Payments, Resend, and
R2-compatible storage, and keeps customer-managed compute hidden for v1.

### Managed Mode Boundary QA

- `DEPLOYMENT_MODE` accepts only `self_host` and `managed`, defaulting to
  `self_host`.
- `@planisfy/platform-policy` is the source of truth for required, optional,
  hidden, and unavailable capabilities.
- `/setup/preflight` returns `deploymentMode` and `capabilities[]` for Console
  and Admin, without replacing detailed self-host first-run checks.
- Console Platform, Settings, Billing, Usage, API Keys, Styles, and Sources use
  the explicit mode/capability response rather than heuristic inference.
- Managed hides execution targets, worker profiles, supervisor controls, support
  bundles, and self-host upgrade affordances from customer Console views.
- Managed API rejects customer execution-target and worker-profile mutations
  with `CAPABILITY_UNAVAILABLE`.

### Managed Onboarding And Billing QA

- Managed users start on the Free plan and can browse Console.
- Managed API key creation and rotation require `emailVerified=true`; otherwise
  routes return `EMAIL_VERIFICATION_REQUIRED` with HTTP 403.
- Billing endpoints distinguish configured, checkout unavailable, active
  subscription, trialing, past due, canceled, and free-plan states.
- Dodo checkout and webhook handling are covered without requiring real network
  calls in fast tests.
- Resend is required for managed readiness and remains optional/dry-run for
  self-host.

### Managed Storage And Runtime QA

- Managed production readiness fails or blocks when R2 bucket, endpoint/account,
  credentials, or public URL are missing.
- Self-host preflight still checks local storage, demo styles, Martin aliases,
  optional PMTiles, backup scripts, and release manifests.
- Managed compute is platform-operated for v1; cloud adapter code may remain,
  but customer-created `aws_batch` and `gcp_batch` targets are self-host or
  internal-only.

### Cloud Runtime QA

- Define deployable environments for API, Console, Admin, workers, Postgres,
  Redis, object storage, Martin/tile serving, CDN, observability, secrets, and
  migrations.
- Prove release promotion, preview deployment, rollback, and environment config
  practices.
- Add abuse controls for signups, API keys, tile requests, uploads, imports,
  storage growth, and worker CPU/runtime.

### Managed Tile Delivery QA

- Implement and prove the planned Cloudflare/R2 tile worker or equivalent CDN
  edge layer.
- Add cache purge, immutable artifact caching, edge usage metering, and clear
  behavior for private/public tilesets.
- Keep MapLibre-compatible style, TileJSON, glyph, sprite, and tile URLs stable
  across managed and self-hosted deployments.

### Managed Data Products QA

- Automate managed basemap releases from Planetiler with provenance,
  attribution, QA checks, changelogs, and versioned manifests.
- Build managed Overture regional extracts with scheduled refreshes,
  customer-selectable regions/themes, and artifact/version retention.
- Decide which premium data packages are open-core compatible, hosted-only, or
  commercial-license-only.

### Billing And Metering QA

- Wire the Dodo Payments-oriented schema/UI to real subscription lifecycle,
  webhook verification, invoices, plan changes, cancellations, trials, and
  failed-payment states.
- Enforce quotas consistently across API requests, tile delivery, uploads,
  imports, storage, and worker runtime.
- Add customer-visible usage breakdowns that match billable units.

### Enterprise And Governance QA

- Add SSO, SCIM, advanced RBAC, approval workflows, audit export,
  long-retention logs, and private-cloud/Helm packaging.
- Add advanced Studio collaboration only after the single-user/org workflow is
  reliable.
- Define commercial-license and proprietary module boundaries for enterprise and
  cloud-only work.

## Suggested QA Execution Order

1. Default map and regional basemap artifact QA.
2. Upload/import restart, failure, validation, and served-tile QA.
3. Console/Studio browser workflow QA.
4. Publishing, rollback, rebuild, and URL-stability QA.
5. Operations readiness QA for schedules, notifications, backups, health,
   support bundles, and upgrades.
6. Documentation and CI truth pass.
7. Managed v1 QA gates.
