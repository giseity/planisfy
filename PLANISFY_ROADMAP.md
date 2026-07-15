# Planisfy Roadmap

This file tracks the current platform status, known product boundaries, and future work. Durable implementation details belong in `README.md`, `ARCHITECTURE.md`, `docs/`, public Fumadocs pages, or package READMEs.

## Current Platform Status

Implemented today:

- Explicit `self_host` and `managed` deployment modes.
- API, Console, Admin, Docs, Marketing, geodata worker, local elevation service, static renderer, optional tile-worker, and optional supervisor apps.
- Docker Compose services for Postgres, Redis, Martin, Valhalla, Pelias, Pelias Elasticsearch, optional MinIO, optional Traefik, optional tile-worker, and optional supervisor.
- Better Auth sessions, organization context, API keys, scopes, origin restrictions, rate limits, quota headers, usage logs, and audit records.
- Style CRUD, versioning, publication state, account-level reusable sprite assets, generated real sprite sheets for published styles, stable style URLs, and version-pinned style URLs.
- Tileset uploads, processing jobs, stale-job reconciliation, outbox dispatch, worker builds, storage ledger rows, PMTiles artifacts, promotion controls, published TileJSON/tile URLs, and optional tile-worker delivery mode.
- Public service proxies for Pelias geocoding, Valhalla routing APIs, local elevation, and static image rendering.
- Health, metrics, setup preflight, backup, restore, backup/restore smoke coverage, support bundles, and guarded supervisor operations.
- Blocking product-loop CI, managed-staging proof workflows, and self-host backup/restore smoke workflows.

## Validated Workflows

The following workflows have been exercised end to end:

- Self-hosted startup on clean Docker volumes, including missing-dataset reporting and recovery after compatible data is installed.
- GeoJSON upload, worker tiling, tileset publication, style publication, public style and TileJSON retrieval, and MapLibre rendering.
- Local and MinIO/S3-backed artifact storage, including publication, profile media, sprite assets, backup, restore, and restart persistence.
- Managed deployment startup, provider configuration, object storage, billing and email adapter availability, public HTTPS ingress, CORS, and the full browser product loop.
- Planet-scale OSM basemap builds through the root-agent Planetiler workflow, including direct object-storage upload, release creation, serving activation, and Martin runtime validation.
- Planet-scale Valhalla routing graph builds through external compute, including direct object-storage upload, release creation, serving activation, and runtime readiness validation.

Validation at planet scale confirms the supported build and activation workflow. It does not imply that every hardware profile, source extract, elevation configuration, or serving topology has identical capacity requirements.

## Current Product Boundaries

- Overture-backed extraction is available for configured imports, but production Overture basemap builds remain disabled until the layer profile and larger-import workflow are complete.
- Managed basemap release automation and downloadable self-host data packs remain future product work; this is separate from the validated OSM and Valhalla build paths.
- Tile-worker delivery is implemented, including API proxying, health/preflight visibility, and a Compose profile. Protected environment credentials and deployment-specific staging checks should be validated for each installation.
- Account sprite assets support PNG/SVG icons and patterns with folders and basic metadata. Richer governance metadata, search, and broader raster/vector asset parity remain future work.
- Tilequery is implemented for PMTiles-backed vector tilesets. Raster value sampling is intentionally outside the current product scope unless a concrete imagery or raster-array workflow requires it.
- Production deployment templates beyond the maintained Docker Compose and current hosted deployment configuration remain limited.

## Release Verification

Release candidates should continue to be verified with the same evidence used during development:

- Clean-volume self-host setup and missing-dataset recovery.
- Browser product-loop coverage.
- Stable and versioned publication URLs through promotion, rollback, rebuild, and storage restore.
- Queue lag, stuck-work, backup/restore, support-bundle, and upgrade visibility.
- Managed provider, storage, billing, email, ingress, and CORS checks where managed mode is being released.
- Documentation review against the implemented routes, configuration, and tested deployment behavior.

These checks are normal release practice rather than indicators of a separate product maturity label.

## Future Work

- Production Overture basemap layer profile and larger-import workflows.
- Managed basemap release automation and downloadable self-host data packs.
- Raster value sampling for imagery, DEM, or raster-array products if a future workflow needs it.
- Cloudflare Worker/R2 tile delivery path.
- Public SDKs and copy-paste examples once the API contract stabilizes.
- More geocoder and routing provider adapters if the API keeps the current provider abstraction.
- Additional production deployment templates.