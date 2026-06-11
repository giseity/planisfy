# Planisfy

Planisfy is a geospatial API platform with first-class `self_host` and
`managed` v1 modes, Mapbox-compatible endpoints, a MapLibre style console, API
key management, usage tracking, and admin tooling.

The goal is to make open geospatial infrastructure easier to run by putting a TypeScript platform layer in front of engines such as Martin, Valhalla, and Pelias-compatible geocoding services.

## Current Status

Planisfy is in active development. Several core flows are implemented, but the
self-hosted and managed v1 product loops still need production hardening end to
end.

Implemented or partially implemented:

- Hono API gateway for public map APIs and console APIs
- better-auth sessions and organization support
- API key authentication, scopes, rate limits, quotas, and usage logging
- PostgreSQL schema and Drizzle migrations
- Map style CRUD, version history, publishing, and a browser style editor
- Tileset upload processing with validation, artifacts, retry/cancel, rebuild,
  and version promotion controls
- Saved regions and source import records, with DuckDB-backed Overture extract
  execution when `OVERTURE_RELEASE` is configured
- Marketing/public, Console, Admin, and Docs Next.js apps
- Docker Compose wiring for local Postgres, Redis, Martin, Valhalla, worker-geodata, local storage, and app containers

Still in progress or externally dependent:

- Tiles require Martin and configured PMTiles data
- Overture imports require DuckDB, `OVERTURE_RELEASE`, and compatible public
  GeoParquet access; larger import UX and managed data releases are still in progress
- Basemap generation now has a Planetiler regional harness, but global basemap
  releases and managed data packages remain later work
- Routing requires Valhalla data under `infra/docker/data/valhalla_data`
- Geocoding prefers Pelias and falls back to Nominatim for basic development use
- Static maps return a placeholder unless `STATIC_MAP_URL` is configured
- Billing uses Dodo Payments-oriented surfaces; it is optional for self-host and
  required for managed
- Email delivery is optional/dry-run for self-host and required through Resend
  for managed
- Test coverage is intentionally small and currently focused on platform contracts

See [PLANISFY_ROADMAP.md](./PLANISFY_ROADMAP.md) for the canonical roadmap, current reality, and credible v1 gate.

## Tech Stack

| Area                     | Technology                                    |
| ------------------------ | --------------------------------------------- |
| Monorepo                 | pnpm workspaces + Turborepo                   |
| API gateway              | Hono on Node.js                               |
| Web apps                 | Next.js 16 + React 19                         |
| Auth                     | better-auth                                   |
| Database                 | PostgreSQL + Drizzle ORM                      |
| Rate limiting and queues | Redis, BullMQ, rate-limiter-flexible          |
| Tiles                    | Martin                                        |
| Routing                  | Valhalla                                      |
| Upload tiling            | Tippecanoe + GDAL/ogr2ogr in `worker-geodata` |
| Source imports           | DuckDB in `worker-geodata`                    |
| Basemap release builds   | Planetiler under `@planisfy/map-styles`       |
| Maps                     | MapLibre GL JS                                |
| UI                       | shared `@planisfy/ui` components              |

## Apps

| App         | Package            | Local URL                            | Purpose                             |
| ----------- | ------------------ | ------------------------------------ | ----------------------------------- |
| Marketing   | `apps/marketing`   | <https://planisfy.localhost>         | Public website and managed auth     |
| Console     | `apps/console`     | <https://console.planisfy.localhost> | Customer dashboard, operations, and style studio |
| Docs        | `apps/docs`        | <https://docs.planisfy.localhost>    | Product and API documentation       |
| Admin       | `apps/admin`       | <https://admin.planisfy.localhost>   | Internal/super-admin views          |
| API         | `apps/api`         | <https://api.planisfy.localhost>     | Hono API gateway                    |
| Supervisor  | `apps/self-host-supervisor` | N/A by default              | Optional local-only self-host upgrades |
| Tile worker | `apps/tile-worker` | N/A                                  | Planned Cloudflare tile delivery    |

## Packages

| Package                       | Purpose                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `@planisfy/auth`              | better-auth setup and helpers                                                          |
| `@planisfy/credentials`       | shared encrypted credential envelope helpers                                           |
| `@planisfy/database`          | Drizzle database client, schema, relations, migrations, and shared server data helpers |
| `@planisfy/geodata-contracts` | shared geodata queue names, heartbeat keys, and worker job input contracts             |
| `@planisfy/types`             | shared TypeScript types and plan limits                                                |
| `@planisfy/utils`             | shared utilities                                                                       |
| `@planisfy/upgrade-manifest`  | self-host upgrade release manifest schema and policy helpers                           |
| `@planisfy/ui`                | shared UI components                                                                   |
| `@planisfy/eslint-config`     | shared ESLint flat configs                                                             |
| `@planisfy/typescript-config` | shared TypeScript configs                                                              |
| `@planisfy/prettier-config`   | shared Prettier config                                                                 |

## Development

Install dependencies:

```bash
pnpm install
```

Run all development servers:

```bash
pnpm dev
```

Local app dev uses `portless`, so browser-facing services are available on
the `.localhost` hostnames above rather than fixed `localhost:PORT` URLs.

The web surfaces are intentionally separate. Marketing/public owns managed auth
entry pages. Console owns authenticated customer workflows and keeps
self-host/local auth fallback pages. Admin remains an internal operations app.
`NEXT_PUBLIC_AUTH_ORIGIN` is the canonical auth origin: the server derives the
Better Auth handler URL from it, and protected Console routes use it for sign-in
redirects.

Run verification:

```bash
pnpm check-types
pnpm lint
pnpm test
```

Build all apps and packages:

```bash
pnpm build
```

## Self-Hosting Locally

Copy the example environment and adjust secrets:

```bash
cp .env.example .env
```

Prepare local self-host demo directories and validate Compose:

```bash
scripts/self-host-setup.sh
```

The setup script seeds the fixture styles and checks whether
`infra/docker/data/pmtiles/stuttgart.pmtiles` exists. Planisfy does not commit
binary map data; when that PMTiles file is missing, the stack can still boot,
but the default Planisfy Streets map will show a clear fixture-data-missing
state until compatible local PMTiles are supplied.

The setup script also validates that the fixture styles, source-layer contract,
and Martin source aliases agree, creates the local storage mount points,
including `infra/docker/data/storage/martin-sources`, and prints the first
account sign-up URL. The API also exposes a public read-only setup preflight at
`http://localhost:4000/setup/preflight` so first-run operators can verify the
self-host product-loop prerequisites before signing in.

To make the demo map render from a reproducible local artifact, set
`DEMO_PMTILES_URL` in `.env` and optionally `DEMO_PMTILES_SHA256`, then run:

```bash
scripts/self-host-setup.sh --demo-data
```

The downloaded file is validated as PMTiles before it is installed at the
Martin mount path.

Start the local stack from the repository root:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

Run database migrations after Postgres is healthy:

```bash
pnpm -F @planisfy/database db:migrate
```

Create the first local Console account after migrations complete:

```text
http://localhost:3001/sign-up
```

Local email delivery is optional. When `RESEND_API_KEY` is not configured, the
Console still lets the signed-in user work with an email verification reminder.

Self-host is the default `DEPLOYMENT_MODE`. Billing, email, the supervisor, and
S3/R2-style storage are optional there; managed deployments must explicitly set
`DEPLOYMENT_MODE=managed` and provide Dodo Payments, Resend, and R2-compatible
storage configuration.

Default service URLs:

- Marketing: <http://localhost:3000>
- Console: <http://localhost:3001>
- Docs: <http://localhost:3002>
- Admin: <http://localhost:3003>
- API: <http://localhost:4000>
- Martin: <http://localhost:3005>
- Valhalla: <http://localhost:3007>

Local demo assets:

- Planisfy Streets fixture styles:
  `packages/map-styles/styles/planisfy-streets-v1.json`,
  `packages/map-styles/styles/planisfy-streets-light-v1.json`, and
  `packages/map-styles/styles/planisfy-streets-dark-v1.json`
- Style release manifest: `packages/map-styles/release-manifest.json`
- Martin PMTiles mount: `infra/docker/data/pmtiles`; the default fixture expects `stuttgart.pmtiles`
- Optional PMTiles preflight/download controls: `DEMO_PMTILES_PATH`, `DEMO_PMTILES_URL`, and `DEMO_PMTILES_SHA256`
- Regional basemap build harness: `pnpm -F @planisfy/map-styles build:planetiler-regional`
- Local object storage mount: `infra/docker/data/storage`

Health checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:4000/setup/preflight
curl http://localhost:3005/catalog
```

Run the Docker Compose smoke test:

```bash
scripts/docker-compose-smoke.sh
```

Optional local S3-compatible storage is available through the MinIO Compose
profile:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
```

Optional pinned-release self-host upgrades are available through the local-only
supervisor profile. Set `SUPERVISOR_TOKEN` in `.env`, then start:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-supervisor up -d self-host-supervisor admin
```

The supervisor listens inside the Compose network and, when exposed, only on
`127.0.0.1:4010`. Admin talks to it server-side through `SUPERVISOR_URL` and
`SUPERVISOR_TOKEN`; browsers should never call it directly. See
[docs/upgrade-path.md](./docs/upgrade-path.md).

Create a redacted support bundle for self-host troubleshooting:

```bash
scripts/self-host-support-bundle.sh
```

Required production hardening:

- Set a strong `BETTER_AUTH_SECRET`
- Set `INTERNAL_API_SECRET` for `/internal/*` API routes
- Replace default database and Redis credentials
- Configure tile, routing, geocoding, email, storage, and billing providers for
  the deployment mode you need

More detail is available in [docs/self-hosting.md](./docs/self-hosting.md) and
[docs/deployment-modes.md](./docs/deployment-modes.md).

## API Surface

Public map endpoints accept API key auth via `X-API-Key` or authenticated session fallback:

- `/tiles/v1/*`
- `/styles/v1/*`
- `/fonts/*`
- `/geocoding/*`
- `/directions/*`
- `/isochrone/*`
- `/matching/*`
- `/matrix/*`
- `/optimized-trips/*`
- `/elevation/*`
- `/static/*`

Console API routes live under `/console/*` and require a session cookie.

Internal platform routes live under `/internal/*` and require `X-Internal-Secret` when `INTERNAL_API_SECRET` is configured. In production, the secret must be configured.

## License

Planisfy source code in this repository is licensed under AGPL-3.0-only unless a package, directory, or file states a different license. Map data, styles, sprites, fonts, tiles, and other assets can carry separate attribution and license obligations; see [NOTICE](./NOTICE) and [docs/data-attribution-policy.md](./docs/data-attribution-policy.md).
