# Planisfy Roadmap

This file tracks launch-readiness gates, known product gaps, and future work. Durable implementation details belong in `README.md`, `ARCHITECTURE.md`, `docs/`, public Fumadocs pages, or package READMEs.

## Current Baseline

Implemented today:

- Explicit `self_host` and `managed` deployment modes.
- API, Console, Admin, Docs, Marketing, geodata worker, local elevation service, static renderer, optional tile-worker, and optional supervisor apps.
- Docker Compose services for Postgres, Redis, Martin, Valhalla, Pelias, Pelias Elasticsearch, optional MinIO, optional Traefik, optional tile-worker, and optional supervisor.
- Better Auth sessions, organization context, API keys, scopes, origin restrictions, rate limits, quota headers, usage logs, and audit records.
- Style CRUD, versioning, publication state, account-level reusable sprite assets, generated real sprite sheets for published styles, stable style URLs, and version-pinned style URLs.
- Tileset uploads, processing jobs, stale-job reconciliation, outbox dispatch, worker builds, storage ledger rows, PMTiles artifacts, promotion controls, published TileJSON/tile URLs, and optional tile-worker delivery mode.
- Public service proxies for Pelias geocoding, Valhalla routing APIs, local elevation, and static image rendering.
- Health, metrics, setup preflight, backup, restore, backup/restore smoke coverage, support bundle, and guarded supervisor operations.
- Blocking product-loop CI, managed-staging proof workflow, and self-host backup/restore smoke workflow.

## V1 Gates

1. Self-host setup should boot repeatably on a clean machine, report missing datasets clearly, and recover after restart.
2. Upload/import to tileset to style to publish should have browser and integration coverage.
3. Published stable and versioned URLs should stay correct through promotion, rollback, rebuild, and storage restore.
4. Operations should expose queue lag, stuck work, backup/restore/upgrade status, support bundles, and actionable health messages.
5. Public docs should remain source-truth-aligned with route implementations and configuration.
6. Managed mode should prove billing, email, storage, secrets, ingress, and operational runbooks before public launch.

## Current Gaps

- Managed-staging and tile-worker workflows are wired, but they still need to run against the real protected CI/staging environments and have their required secrets validated.
- Account sprite assets support PNG/SVG icons and patterns with folders and basic metadata; broader style asset management remains future work, including asset folders as a first-class management surface, richer search/governance metadata, and raster sprite/vector icon parity.
- Tilequery is implemented for PMTiles-backed vector tilesets. Raster tilequery is intentionally not required or planned for v1; raster value sampling can be revisited later if a concrete product use case appears.
- Larger Overture import UX, managed basemap releases, and global release packaging need more product and QA work.
- Managed-mode launch still needs real protected environment runs, provider dashboard evidence, and operator sign-off.
- Before tagging a self-host release, repeat the clean-volume rehearsal on the exact release branch or tag and archive the evidence.

## Recently Closed Launch Gaps

- Product-loop browser CI now runs as a blocking workflow on PRs and `main`.
- Local self-host Compose smoke has passed with browser product-loop coverage against Docker volumes, local storage, Martin, Console sign-in, public style/TileJSON fetches, and MapLibre rendering.
- Full product-loop QA has passed against self-host Compose by uploading GeoJSON, waiting for worker tiling, publishing the tileset and style, fetching public URLs, and rendering the style.
- Local MinIO/S3 runtime QA has passed for full product-loop upload, worker processing, tileset publication, TileJSON/style rendering, profile avatar upload, and sprite SVG upload.
- Self-host backup/restore smoke coverage now verifies local storage and MinIO/S3 archives, health, preflight, style URLs, and TileJSON after restore.
- Stale `processing_jobs` are reconciled from worker-geodata and exposed through operations.
- Managed-mode staging proof coverage now checks startup config, preflight, storage, billing adapter availability, email adapter availability, and the full product loop when protected staging credentials are supplied.
- Account-level PNG/SVG sprite assets are reusable in Studio, include folders and basic tags, and publish into real MapLibre sprite sheets.
- `TILE_DELIVERY_MODE=api|worker` is implemented with API-to-tile-worker proxying, health/preflight visibility, and a `with-tile-worker` Compose profile.
- Operations now validate scheduled run timing, persist notification delivery proof, expose retention-aware usage windows, and include a supervisor upgrade smoke.
- Managed staging smoke coverage now checks public HTTPS ingress and API CORS for the configured Console origin.
- Self-host clean-machine rehearsal and missing-dataset recovery are documented.

## Future Work

- Managed basemap release pipeline and downloadable self-host data packs.
- Raster value sampling for imagery, DEM, or raster-array products if a future workflow needs it.
- Cloudflare Worker/R2 tile delivery path.
- Public SDKs and copy-paste examples once the API contract stabilizes.
- More geocoder/routing provider adapters if the API keeps the current provider abstraction.
- Production deployment templates beyond the local Docker Compose stack.
