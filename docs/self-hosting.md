# Self Hosting

The local self-host path is Docker Compose from the repository root:

```bash
cp .env.example .env
scripts/self-host-setup.sh
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm --filter @planisfy/database db:migrate
```

## Compose Services

The stack defines API, Console, Admin, Docs, Marketing, worker-geodata, Postgres, Redis, Martin, Valhalla, local elevation, static renderer, Pelias API, Pelias Elasticsearch, optional Pelias fixture import jobs, optional MinIO, optional Traefik, and optional self-host supervisor.

## Runtime Data

Ignored runtime data lives under `infra/docker/data`:

- `pmtiles`: PMTiles files mounted into Martin.
- `fonts`: glyph PBF files served by Martin.
- `elevation`: SRTM HGT files used by `apps/elevation`.
- `valhalla_data`: Valhalla graph/runtime data.
- `storage`: local Planisfy artifact storage.
- `pelias/csv`: optional fixture CSV import data.

Planisfy does not commit binary datasets. Missing data should produce degraded service checks, not prevent the core apps from booting.

## Useful Commands

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
docker compose --env-file .env -f infra/docker/docker-compose.yml logs -f api
curl http://localhost:4000/health/detailed
curl http://localhost:4000/setup/preflight
```

Optional profiles:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-supervisor up -d self-host-supervisor admin
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-proxy up -d traefik
```

## First Account

After migrations complete, create a Console account at `http://localhost:3001/sign-up`.

## Verification

- `/health` checks basic API readiness.
- `/health/detailed` probes Postgres, Redis, worker heartbeat, storage, Martin, and Valhalla readiness.
- `/setup/preflight` reports product-loop and deployment-mode readiness.
- `scripts/self-host-default-map-smoke.mjs` checks the local PMTiles fixture when present.
- `pnpm e2e:product-loop` runs the browser product-loop smoke against a running stack.
