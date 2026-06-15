# Planisfy

Planisfy is a TypeScript geospatial API platform for publishing MapLibre styles, vector tiles, and related map services on open-source engines. The repository contains the API gateway, Console, Admin, Docs, local geodata worker, self-hosting stack, and shared packages.

The product supports two configured deployment modes:

- `self_host`: local or customer-managed infrastructure. Billing, email, supervisor, and object storage are optional.
- `managed`: hosted operation. Billing, email, and R2/S3-compatible object storage are required by policy.

Roadmap and product-readiness gaps live in [PLANISFY_ROADMAP.md](./PLANISFY_ROADMAP.md). This README describes what is implemented in this repository today.

## Repository Map

| Path | Purpose |
| --- | --- |
| `apps/api` | Hono API gateway for public map APIs, auth, console APIs, internal webhooks, health, and metrics. |
| `apps/console` | Customer Console for styles, tilesets, keys, usage, operations, platform readiness, and account settings. |
| `apps/admin` | Internal operations app for tenants, jobs, storage, usage, health, and upgrades. |
| `apps/docs` | Fumadocs public documentation site. |
| `apps/marketing` | Public site and managed-mode auth entry pages. |
| `apps/worker-geodata` | BullMQ/outbox worker for uploads, tiling, imports, and artifact ledger updates. |
| `apps/elevation` | Local SRTM HGT elevation lookup service used by the API in Docker Compose. |
| `apps/static-renderer` | Local MapLibre PNG renderer used by the API static map route. |
| `apps/self-host-supervisor` | Optional local-only supervisor for guarded backup, upgrade, and rollback actions. |
| `apps/tile-worker` | Placeholder app; not wired into the current runtime. |
| `packages/*` | Shared auth, database, env, event, storage, style, policy, UI, and tooling packages. |
| `infra/docker` | Docker Compose stack, engine configs, and ignored runtime data mounts. |
| `docs` | Durable contributor and operator references. |

## Implemented Public API Surface

The API gateway mounts these route groups:

- Published assets: `/tiles/*`, `/styles/v1/*`, and `/fonts/*`. Missing auth is allowed for public published assets; valid API keys or sessions are still accepted for metering and private-owner access.
- Service APIs: `/geocoding/*`, `/directions/*`, `/isochrone/*`, `/matching/*`, `/matrix/*`, `/optimized-trips/*`, `/elevation/*`, and `/static/*`. These require `X-API-Key` or a valid session.
- Console APIs: `/console/*`. These require a session cookie.
- Internal routes: `/internal/*` and `/webhooks/dodo`. Internal routes use `INTERNAL_API_SECRET`; the Dodo webhook verifies the configured webhook secret.
- Health and support endpoints: `/health`, `/health/detailed`, `/metrics`, `/setup/preflight`, and public local storage reads under `/storage/*`.

External geospatial engines are optional only in the sense that the process can start without useful data. Geocoding needs Pelias, routing needs Valhalla graph data, tiles need Martin or uploaded PMTiles artifacts, elevation needs DEM tiles, and static maps need the static renderer.

## Local Development

Install dependencies:

```bash
pnpm install
```

Copy the local environment:

```bash
cp .env.example .env
```

Run all development servers through Turborepo:

```bash
pnpm dev
```

Local dev uses `portless` hostnames for web apps:

| Surface | URL |
| --- | --- |
| Marketing | `https://planisfy.localhost` |
| Console | `https://console.planisfy.localhost` |
| Docs | `https://docs.planisfy.localhost` |
| Admin | `https://admin.planisfy.localhost` |
| API | `https://api.planisfy.localhost` |

Common verification commands are turbo-backed at the root:

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
```

Package-specific examples:

```bash
pnpm --filter api test
pnpm --filter docs check-types
pnpm --filter @planisfy/database db:migrate
```

## Self-Host Quick Path

From the repository root:

```bash
cp .env.example .env
scripts/self-host-setup.sh
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm --filter @planisfy/database db:migrate
```

Default local ports:

| Service | URL |
| --- | --- |
| Marketing | `http://localhost:3000` |
| Console | `http://localhost:3001` |
| Docs | `http://localhost:3002` |
| Admin | `http://localhost:3003` |
| API | `http://localhost:4000` |
| Martin | `http://localhost:3005` |
| Valhalla | `http://localhost:3007` |
| Pelias | `http://localhost:3100` |
| Local elevation | `http://localhost:4011` |
| Static renderer | `http://localhost:4300` |

Check the stack:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:4000/setup/preflight
```

Planisfy does not commit binary map, routing, geocoding, or DEM datasets. A clean stack can boot with degraded map service checks until compatible files are placed under `infra/docker/data/*` or provider URLs are configured.
