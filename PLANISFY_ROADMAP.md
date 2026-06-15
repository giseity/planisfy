# Planisfy Roadmap

This file is the only place for product gaps and future work. Durable implementation details belong in `README.md`, `ARCHITECTURE.md`, `docs/`, public Fumadocs pages, or package READMEs.

## Current Baseline

Implemented today:

- Explicit `self_host` and `managed` deployment modes.
- API, Console, Admin, Docs, Marketing, geodata worker, local elevation service, static renderer, and optional supervisor apps.
- Docker Compose services for Postgres, Redis, Martin, Valhalla, Pelias, Pelias Elasticsearch, optional MinIO, optional Traefik, and optional supervisor.
- Better Auth sessions, organization context, API keys, scopes, origin restrictions, rate limits, quota headers, usage logs, and audit records.
- Style CRUD, versioning, publication state, stable style URLs, and version-pinned style URLs.
- Tileset uploads, processing jobs, outbox dispatch, worker builds, storage ledger rows, PMTiles artifacts, promotion controls, and published TileJSON/tile URLs.
- Public service proxies for Pelias geocoding, Valhalla routing APIs, local elevation, and static image rendering.
- Health, metrics, setup preflight, backup, restore, support bundle, and guarded supervisor operations.

## V1 Gates

1. Self-host setup should boot repeatably on a clean machine, report missing datasets clearly, and recover after restart.
2. Upload/import to tileset to style to publish should have browser and integration coverage.
3. Published stable and versioned URLs should stay correct through promotion, rollback, rebuild, and storage restore.
4. Operations should expose queue lag, stuck work, backup/restore/upgrade status, support bundles, and actionable health messages.
5. Public docs should remain source-truth-aligned with route implementations and configuration.
6. Managed mode should prove billing, email, storage, secrets, ingress, and operational runbooks before public launch.

## Current Gaps

- Sprite publishing and tilequery are implemented for PMTiles/vector-style paths; broader asset management and raster parity remain future work.
- Tile-worker is available as an internal runtime; API proxying to it remains optional deployment work.
- Larger Overture import UX, managed basemap releases, and global release packaging need more product and QA work.
- Browser coverage for the full Console product loop is still limited.
- Operations need stronger stuck-job reconciliation, schedule execution, notification delivery, and retention-aware usage summaries.
- Restore and upgrade paths need broader automated smoke coverage.

## Future Work

- Managed basemap release pipeline and downloadable self-host data packs.
- Cloudflare Worker/R2 tile delivery path.
- Public SDKs and copy-paste examples once the API contract stabilizes.
- More geocoder/routing provider adapters if the API keeps the current provider abstraction.
- Production deployment templates beyond the local Docker Compose stack.
