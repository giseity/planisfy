# Planisfy

Planisfy is an open-source, self-hostable Mapbox Platform layer for teams building with MapLibre, vector tiles, routing, geocoding, API keys, usage tracking, jobs, and map operations.

MapLibre is the open-source renderer. Planisfy is the platform/control-plane layer around it.

## Why Planisfy?

Using MapLibre gives you an open renderer, but a production map platform usually needs more than rendering:

- MapLibre-compatible style publishing
- Vector tile and PMTiles-backed tileset delivery
- API keys, scopes, usage tracking, and rate limits
- Geocoding, reverse geocoding, routing, isochrones, matrices, optimized trips, elevation, and static maps
- Background jobs for uploads, imports, tiling, and artifact management
- Health checks, setup preflight, operational visibility, backup, restore, and upgrade paths
- Managed and self-hosted deployment modes from the same codebase

Planisfy focuses on that surrounding platform layer so teams do not have to stitch every map service, operational check, and control-plane concern together from scratch.

## What This Repository Contains

This repository contains the open-source Planisfy platform implementation:

| Path                        | Purpose                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/api`                  | Hono API gateway for public map APIs, auth, console APIs, internal routes, health, and metrics.               |
| `apps/console`              | Customer Console for styles, tilesets, API keys, usage, platform readiness, operations, and account settings. |
| `apps/admin`                | Internal operations app for tenants, jobs, storage, usage, health, audits, and upgrades.                      |
| `apps/docs`                 | Fumadocs public documentation site.                                                                           |
| `apps/marketing`            | Public website and managed-mode auth entry pages.                                                             |
| `apps/worker-geodata`       | BullMQ/outbox worker for uploads, imports, tiling, and artifact ledger updates.                               |
| `apps/elevation`            | Local SRTM HGT elevation lookup service used by the API in Docker Compose.                                    |
| `apps/static-renderer`      | Local MapLibre PNG renderer used by the static map API route.                                                 |
| `apps/self-host-supervisor` | Optional local-only supervisor for guarded backup, upgrade, and rollback actions.                             |
| `apps/tile-worker`          | Optional isolated PMTiles delivery runtime. The API serves tiles directly by default.                         |
| `packages/*`                | Shared auth, database, env, event, storage, style, policy, UI, and tooling packages.                          |
| `infra/docker`              | Docker Compose stack, engine configs, and ignored runtime data mounts.                                        |
| `docs`                      | Durable contributor and operator references.                                                                  |

## Public API Surface

The API gateway includes:

- Published assets: `/tiles/*`, `/styles/v1/*`, and `/fonts/*`
- Service APIs: `/geocoding/*`, `/directions/*`, `/isochrone/*`, `/matching/*`, `/matrix/*`, `/optimized-trips/*`, `/elevation/*`, and `/static/*`
- Console APIs: `/console/*`
- Internal, health, support, and setup endpoints: `/internal/*`, `/health`, `/health/detailed`, `/metrics`, and `/setup/preflight`

External geospatial engines are configured separately. Geocoding needs Pelias, routing needs Valhalla graph data, tiles need Martin or uploaded PMTiles artifacts, elevation needs DEM tiles, and static maps need the static renderer.

## Deployment Modes

Planisfy supports two deployment modes:

- `self_host`: local or customer-managed infrastructure.
- `managed`: hosted operation using the same API, Console, Admin, Docs, Marketing, worker, database schema, publication model, and public route shapes.

The difference is policy and configuration, not separate codebases. See [docs/deployment-modes.md](./docs/deployment-modes.md) for provider and capability details.

## Documentation

- [Architecture](./docs/architecture.md)
- [Deployment modes](./docs/deployment-modes.md)
- [Self hosting](./docs/self-hosting.md)
- [Operations](./docs/operations.md)
- [Testing](./docs/testing.md)
- [Security](./docs/security.md)
- [V1 trust checklist](./docs/v1-trust-checklist.md)
- [Roadmap](./PLANISFY_ROADMAP.md)

Public user-facing docs live in `apps/docs/content/docs`.

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

| Surface   | URL                                  |
| --------- | ------------------------------------ |
| Marketing | `https://planisfy.localhost`         |
| Console   | `https://console.planisfy.localhost` |
| Docs      | `https://docs.planisfy.localhost`    |
| Admin     | `https://admin.planisfy.localhost`   |
| API       | `https://api.planisfy.localhost`     |

Common verification commands are turbo-backed at the root:

```bash
pnpm verify
pnpm check-types
pnpm lint
pnpm test
pnpm build
```

Package-specific examples:

```bash
pnpm --filter api test
pnpm --filter docs check-types
pnpm db:migrate
```

## Self-Host Quick Path

From the repository root:

```bash
cp .env.example .env
pnpm self-host:setup
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm db:migrate
```

Default local ports:

| Service         | URL                     |
| --------------- | ----------------------- |
| Marketing       | `http://localhost:3000` |
| Console         | `http://localhost:3001` |
| Docs            | `http://localhost:3002` |
| Admin           | `http://localhost:3003` |
| API             | `http://localhost:4000` |
| Martin          | `http://localhost:3005` |
| Valhalla        | `http://localhost:3007` |
| Pelias          | `http://localhost:3100` |
| Local elevation | `http://localhost:4011` |
| Static renderer | `http://localhost:4300` |

Check the stack:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:4000/setup/preflight
```

Planisfy does not commit binary map, routing, geocoding, or DEM datasets. A clean stack can boot with degraded map service checks until compatible files are placed under `infra/docker/data/*` or provider URLs are configured.

## Contributor Notes

Planisfy keeps user-facing app surfaces behind explicit package and HTTP contracts. Console should call the API through `@planisfy/api-contracts` and its local API client; it should not import API route internals, the database package, or Drizzle directly.

Admin is an internal operator surface and may depend on server-side packages such as `@planisfy/database` when it needs direct control-plane access. Shared runtime behavior that crosses apps should live in `packages/*` or behind an API route rather than as app-to-app imports.

Planisfy keeps workspace packages and apps on ESM by default with `"type": "module"`. Node services use TypeScript directly in development, but production starts compiled JavaScript from `dist/` after `tsup` builds. Next.js apps keep TypeScript source because Next owns compilation for client and server code.

## License

Planisfy is licensed under [AGPL-3.0-only](./LICENSE).
