# Self Hosting

## Goal

Planisfy's main self-host story should be boring and repeatable from the
repository root:

```bash
scripts/self-host-setup.sh
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm -F @planisfy/database db:migrate
```

The stack should produce a useful product without cloud credentials, billing,
email, routing data, or geocoding. Missing map/routing data should degrade to a
clear fixture state rather than blocking application startup.

## Current Services

- API
- console
- admin
- docs
- marketing
- worker-geodata
- PostgreSQL
- Redis
- Martin
- Valhalla
- local artifact storage bind mount at `infra/docker/data/storage`

## Setup Script

Run the setup script before the first Compose boot:

```bash
scripts/self-host-setup.sh
```

The script:

1. copies `.env.example` to `.env` when needed;
2. creates local demo directories under `infra/docker/data/`;
3. copies the Planisfy Streets fixture style into local storage;
4. validates the Compose file with `docker compose config`.

Optional flags:

```bash
scripts/self-host-setup.sh --pull      # pull public engine/database images
scripts/self-host-setup.sh --up        # prepare, then start the full stack
scripts/self-host-setup.sh --migrate   # start dependencies, then run Drizzle migrations
```

## Demo Data Layout

| Path | Purpose |
| --- | --- |
| `infra/docker/data/pmtiles/` | Martin PMTiles mount. Add `stuttgart.pmtiles` for the default `stuttgart-base` source. |
| `infra/docker/data/valhalla_data/` | Valhalla graph/runtime data mounted at `/custom_files`. |
| `infra/docker/data/storage/uploads/` | Local upload/object storage area. |
| `infra/docker/data/storage/styles/` | Demo and published style JSON. The setup script seeds `planisfy-streets-v1.json`. |
| `packages/map-styles/` | Versioned Planisfy Streets fixture style, source-layer contract, schema, and release manifest. |

The repository intentionally does not store binary map data. Keep downloaded
PMTiles and Valhalla graph data outside Git while preserving these mount points.

## Migrations

Run database migrations after Postgres is healthy:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d postgres redis
pnpm -F @planisfy/database db:migrate
```

For a full demo boot:

```bash
scripts/self-host-setup.sh --up
pnpm -F @planisfy/database db:migrate
```

## Health Checks

Basic checks after startup:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:3005/catalog
curl http://localhost:3007/status
```

Expected notes:

- `/health` should return quickly once the API container is ready.
- `/health/detailed` is the best single endpoint for database, Redis, engine,
  and worker heartbeat status.
- Martin can start without `stuttgart.pmtiles`, but tile requests for
  `planisfy.basic` require that local file.
- Valhalla starts with the mounted data directory, but routing quality depends
  on graph tiles placed in `infra/docker/data/valhalla_data/`.

## Default Service URLs

| Service | URL |
| --- | --- |
| Marketing | <http://localhost:3000> |
| Console | <http://localhost:3001> |
| Docs | <http://localhost:3002> |
| Admin | <http://localhost:3003> |
| API | <http://localhost:4000> |
| Martin | <http://localhost:3005> |
| Valhalla | <http://localhost:3007> |

## Target Additions

- PostGIS-enabled database image.
- optional MinIO profile.
- Docker smoke test.
- Seeded bootstrap account flow.

## Acceptance

- Console shows a real map when compatible PMTiles are supplied.
- Demo style, source metadata, and sample tiles agree.
- Health reports API, database, Redis, Martin, Valhalla, and worker-geodata heartbeat state.
- New developers can complete setup from the README and docs.
