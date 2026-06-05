# Planisfy Geodata Worker

Outbox dispatcher and BullMQ worker for long-running geodata processing.

## Owns

- Tileset upload processing.
- Claiming `tileset.build.requested` outbox events and dispatching build jobs to BullMQ.
- Redis heartbeat for API health reporting.
- PMTiles passthrough and GeoJSON-to-PMTiles conversion.
- Processing job status and log updates.
- Processed artifact storage ledger rows.

## Does Not Own

- Public API routes.
- Auth/session handling.
- Storage key contract definitions.
- Database schema definitions.

## Runtime

Required services:

- PostgreSQL via `DATABASE_URL`
- Redis via `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`
- Local disk or S3/R2-compatible storage settings

Optional tools:

- `tippecanoe` for GeoJSON/CSV to PMTiles conversion. If missing, GeoJSON uploads are stored as raw GeoJSON for local development.

Optional tuning:

- `GEODATA_OUTBOX_POLL_INTERVAL_MS` controls how often due outbox events are claimed.
- `GEODATA_OUTBOX_BATCH_SIZE` controls the number of build-request events claimed per tick.

## Commands

```bash
pnpm -F worker-geodata dev
pnpm -F worker-geodata check-types
pnpm -F worker-geodata lint
pnpm -F worker-geodata build
```
