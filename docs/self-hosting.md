# Self Hosting

The local self-host path is Docker Compose from the repository root:

```bash
cp .env.example .env
pnpm self-host:setup
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
pnpm db:migrate
```

## Compose Services

The stack defines API, Console, Admin, Docs, Marketing, worker-geodata, Postgres, Redis, Martin, Valhalla, local elevation, static renderer, Pelias API, Pelias Elasticsearch, optional Pelias fixture import jobs, MinIO through the recommended `with-minio` profile, optional Traefik, optional tile-worker, and optional self-host supervisor.

## VPS Platforms

Dokploy and similar VPS app platforms are self-host deployment targets. Keep
`DEPLOYMENT_MODE=self_host` and validate the platform wiring rather than using
managed mode:

- Public domains and TLS terminate correctly for API and Console.
- Environment variables are injected into the app services.
- Postgres, Redis, MinIO object storage, PMTiles, Valhalla, and optional local demo storage
  data live on persistent volumes.
- Database and Redis ports are private to the deployment network.
- Public routing exposes API and Console origins expected by `NEXT_PUBLIC_*`
  and `CONSOLE_API_INTERNAL_ORIGIN`.

Use the generic self-host smokes against that environment once a stable public
URL exists. There is no Dokploy-specific smoke command until there is an actual
Dokploy deployment target to test.

## Runtime Data

Ignored runtime data lives under `infra/docker/data`:

- `pmtiles`: PMTiles files mounted into Martin.
- `fonts`: glyph PBF files served by Martin.
- `elevation`: SRTM HGT files used by `apps/elevation`.
- `valhalla_data`: Valhalla graph/runtime data.
- `minio`: default self-host artifact storage.
- `storage`: local Planisfy artifact storage for demo/dev fallback.
- `pelias/csv`: optional fixture CSV import data.

Planisfy does not commit binary datasets. Missing data should produce degraded service checks, not prevent the core apps from booting.

Use `scripts/self-host-setup.sh --demo-data` with `PLANISFY_FIXTURE_BASE_URL`
or `DEMO_PMTILES_URL` to install the public Stuttgart PMTiles fixture. If the
fixture is already present, setup validates and reuses it. `DEMO_PMTILES_FALLBACK_URL`
and `DEMO_PMTILES_FALLBACK_PATH` can point at a mirror or local PMTiles file
when the public bucket is unavailable.

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
TILE_DELIVERY_MODE=worker docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-tile-worker up -d api tile-worker
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-supervisor up -d self-host-supervisor admin
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-proxy up -d traefik
```

The `with-minio` profile starts local S3-compatible storage and a one-shot
bucket initializer. `.env.example` defaults to `STORAGE_PROVIDER=s3`,
`CONTAINER_S3_ENDPOINT=http://minio:9000`, and a host-visible `S3_PUBLIC_URL`.

## Tile Worker Mode

`TILE_DELIVERY_MODE=api` is the default. In that mode, `apps/api` reads published PMTiles artifacts directly and only falls back to Martin for legacy/non-PMTiles sources.

Set `TILE_DELIVERY_MODE=worker` and run the `with-tile-worker` profile when you want public tile and tilequery reads isolated from the API process. Keep `TILE_WORKER_URL` pointed at the internal worker origin (`http://tile-worker:4020` inside Compose). TileJSON URLs remain API URLs, so clients do not need to change.

## First Account

After migrations complete, create a Console account at `http://localhost:3001/sign-up`.

## Verification

- `/health` checks basic API readiness.
- `/health/detailed` probes Postgres, Redis, worker heartbeat, storage, Martin, tile-worker mode, and Valhalla readiness.
- `/setup/preflight` reports product-loop, tile delivery, and deployment-mode readiness.
- `pnpm smoke:self-host-default-map` checks the local PMTiles fixture when present.
- `pnpm e2e:product-loop` runs the browser product-loop smoke against a running stack.
