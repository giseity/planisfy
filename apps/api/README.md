# Planisfy API

Hono API gateway for Planisfy's public map API, console API, auth handler, and internal platform routes.

## Owns

- Public map route groups for styles, tiles, fonts, geocoding, routing, elevation, and static maps.
- Console API routes for styles, API keys, uploads, tilesets, usage, audit, billing status, and profile settings.
- API key validation, session fallback, scope checks, rate limits, quota checks, and usage logging.
- Request logging, health probes, and Prometheus-style process/request metrics.
- Internal platform routes protected by `X-Internal-Secret`.
- Durable backend mutations through upload records, processing jobs, storage ledger rows, and outbox events.

## Does Not Own

- Heavy geodata processing. `apps/worker-geodata` owns upload validation and tileset artifact generation.
- Studio client state.
- Storage key contract definitions.
- Event payload schema definitions.

## Important Commands

```bash
pnpm -F api dev
pnpm -F api check-types
pnpm -F api lint
pnpm -F api test
pnpm -F api build
```

## Local Runtime

Default port: `4000`.

Required local services:

- PostgreSQL via `DATABASE_URL`
- Redis via `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`
- Martin via `MARTIN_URL`
- Pelias-compatible geocoder via `PELIAS_URL`
- Valhalla via `VALHALLA_URL`; health/preflight also run a small route probe.
  Set `VALHALLA_READINESS_ROUTE=lon,lat;lon,lat` when the default Stuttgart
  probe is outside your graph.

Optional providers:

- Local glyph serving through Martin via `GLYPHS_URL`
- Local SRTM elevation service via `ELEVATION_URL`
- Static map renderer via `STATIC_MAP_URL`
- Email provider via `RESEND_API_KEY`
- Storage provider via local disk, S3, or Cloudflare R2-compatible settings
- Dodo Payments via `DODO_PAYMENTS_API_KEY`, `DODO_PRO_PRODUCT_ID`, and
  `DODO_PAYMENTS_WEBHOOK_SECRET`

Seed the local Pelias dev index with:

```bash
scripts/pelias-dev-fixture.sh --reset
```

Local self-host compose serves local artifacts from `/storage/*` and records artifact metadata in `storage_objects`.

## Gotchas

- Production-like environments must set `INTERNAL_API_SECRET`; internal routes must not be exposed with the fallback development secret.
- Tileset uploads create `uploads`, `storage_objects`, `tilesets`, `processing_jobs`, and `tileset.build.requested` outbox events. `apps/worker-geodata` claims those events and dispatches BullMQ transport work.
- Published tilesets are promoted explicitly through `/console/tilesets/:id/versions/:version/publish`; processing alone does not make a new version public.
- `STORAGE_PROVIDER=r2` uses signed S3-compatible R2 access. Published PMTiles are served through API-owned tile URLs, and stable/versioned object aliases are written under `TILE_ALIAS_STORAGE_PREFIX` for deployments that need direct object-store references. `MARTIN_SOURCES_PREFIX` remains supported as a legacy fallback for that prefix.
- Dodo checkout is created server-side from plan IDs, not client-supplied
  product IDs. Configure the webhook endpoint at `/webhooks/dodo` so Dodo
  subscription events can update `subscriptions` and related billing ledger
  rows.
- `/metrics` exposes in-memory Prometheus text metrics for the API process.
  Treat this endpoint as operator-facing when deploying behind public ingress.
