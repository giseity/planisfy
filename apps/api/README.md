# Planisfy API

Hono API gateway for Planisfy's public map API, console API, auth handler, and internal platform routes.

## Owns

- Public map route groups for styles, tiles, fonts, geocoding, routing, elevation, and static maps.
- Console API routes for styles, API keys, sources, usage, audit, billing status, and profile settings.
- API key validation, session fallback, scope checks, rate limits, quota checks, and usage logging.
- Internal platform routes protected by `X-Internal-Secret`.
- Durable backend mutations through upload records, processing jobs, storage ledger rows, and outbox events.

## Does Not Own

- Heavy geodata processing.
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
- Valhalla via `VALHALLA_URL`

Optional providers:

- Pelias-compatible geocoder via `GEOCODING_URL`
- Static map renderer via `STATIC_MAP_URL`
- Email provider via `RESEND_API_KEY`
- Storage provider via local disk or S3/R2-compatible settings

## Gotchas

- Production-like environments must set `INTERNAL_API_SECRET`; internal routes must not be exposed with the fallback development secret.
- Source uploads now create `uploads`, `storage_objects`, `processing_jobs`, and `event_outbox` records before using BullMQ as the current transport. The next restructuring step moves event claiming and geodata execution into `apps/worker-geodata`.
- Billing code currently contains alpha Polar references. The target provider is Dodo Payments.
