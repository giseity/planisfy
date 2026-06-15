# Elevation Service

Hono service that samples local SRTM HGT files and exposes `POST /api/v1/lookup` plus `GET /health`.

Runs in Compose behind the API on container port `8080`, published locally at `127.0.0.1:4011`.

Important config: `PORT`, `HOST`, and `ELEVATION_DEM_DIR`.

Commands: `pnpm --filter elevation dev`, `check-types`, `lint`, `test`, `build`, `start`.
