# Planisfy Geodata Worker

Outbox dispatcher and BullMQ worker for long-running geodata processing.

## Owns

- Tileset upload processing.
- Claiming `tileset.build.requested` outbox events and dispatching build jobs to BullMQ.
- Redis heartbeat for API health reporting.
- PMTiles/MBTiles passthrough and upload tiling with Tippecanoe.
- DuckDB-backed Overture/source import extraction.
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

Required local tools for full processing:

- `tippecanoe` for GeoJSON/CSV/converted Shapefile to PMTiles conversion.
- `ogr2ogr` from GDAL for zipped Shapefile conversion before tiling.
- `duckdb` for Overture GeoParquet extraction when `OVERTURE_RELEASE` is configured.

The worker Docker image installs DuckDB, GDAL/`ogr2ogr`, and Tippecanoe
`1.36.0`. Host development can override paths with `DUCKDB_PATH`,
`TIPPECANOE_PATH`, and `OGR2OGR_PATH`.

Tippecanoe is required by default for GeoJSON, CSV, and Shapefile uploads. Set
`GEODATA_ALLOW_RAW_FALLBACK=true` only for local degraded development; in that
mode missing Tippecanoe stores the raw upload as a non-served directory artifact
instead of producing PMTiles.

Optional tuning:

- `GEODATA_OUTBOX_POLL_INTERVAL_MS` controls how often due outbox events are claimed.
- `GEODATA_OUTBOX_BATCH_SIZE` controls the number of build-request events claimed per tick.

## Commands

```bash
pnpm -F worker-geodata dev
pnpm -F worker-geodata check-types
pnpm -F worker-geodata lint
pnpm -F worker-geodata build
pnpm -F worker-geodata test
```
