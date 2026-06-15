# Tile Worker

Internal Hono service for self-hosted PMTiles delivery. It reuses the shared
`@planisfy/tile-runtime` resolver, so the database and storage records remain
owned by Planisfy rather than a second tile data model.

Routes:

- `GET /health`
- `GET /tiles/v1/{owner}.{handle}/{z}/{x}/{y}`
- `GET /tiles/v1/{owner}.{handle}@{version}/{z}/{x}/{y}`
- `GET /tiles/v1/{owner}/{handle}/{z}/{x}/{y}`
- `GET /tiles/v1/{owner}/{handle}/versions/{version}/{z}/{x}/{y}`
- `GET /v4/{owner}.{handle}/tilequery/{lon},{lat}.json`

The API app still serves public tiles directly by default. This worker is an
optional runtime target for deployments that want tile delivery isolated from
the API process.
