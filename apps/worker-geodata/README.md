# Geodata Worker

Outbox dispatcher and BullMQ worker for uploads, tiling, Overture/source imports, artifact storage, job logs, and worker heartbeat.

Runs beside the API anywhere upload/import processing is enabled. Compose starts it as `worker-geodata`.

Important config: `DATABASE_URL`, Redis settings, storage provider variables, worker concurrency/outbox settings, `DUCKDB_PATH`, `TIPPECANOE_PATH`, `OGR2OGR_PATH`, and Overture import settings.

Commands: `pnpm --filter worker-geodata dev`, `check-types`, `lint`, `test`, `build`, `start`.
