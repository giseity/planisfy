# Planisfy Geodata Contracts

Shared geodata worker contracts for the API, Admin, and worker apps.

## Owns

- Source-processing queue names and worker heartbeat keys.
- Tileset build input types and parsers.
- Retry source-resource mapping for upload-backed and dataset-backed builds.

## Does Not Own

- BullMQ worker runtime setup.
- Database status transitions.
- Storage artifact writes.
- Tippecanoe, GDAL, DuckDB, or cloud execution logic.

## Important Commands

```bash
pnpm -F @planisfy/geodata-contracts check-types
pnpm -F @planisfy/geodata-contracts test
pnpm -F @planisfy/geodata-contracts lint
```
