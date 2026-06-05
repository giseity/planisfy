# Planisfy

Planisfy is an alpha-stage, self-hostable geospatial API platform with Mapbox-compatible endpoints, a MapLibre style console, API key management, usage tracking, and admin tooling.

The goal is to make open geospatial infrastructure easier to run by putting a TypeScript platform layer in front of engines such as Martin, Valhalla, and Pelias-compatible geocoding services.

## Current Status

Planisfy is in alpha. Several core flows are implemented, but the self-hosted product loop is not yet production-ready end to end.

Implemented or partially implemented:

- Hono API gateway for public map APIs and console APIs
- better-auth sessions and organization support
- API key authentication, scopes, rate limits, quotas, and usage logging
- PostgreSQL schema and Drizzle migrations
- Map style CRUD, version history, publishing, and a browser style editor
- Console, admin, marketing, and docs Next.js apps
- Docker Compose wiring for local Postgres, Redis, Martin, Valhalla, worker-geodata, local storage, and app containers

Still alpha or externally dependent:

- Tiles require Martin and configured PMTiles data
- Routing requires Valhalla data under `infra/docker/data/valhalla_data`
- Geocoding prefers Pelias and falls back to Nominatim for basic development use
- Static maps return a placeholder unless `STATIC_MAP_URL` is configured
- Billing uses Dodo Payments-oriented surfaces and is disabled unless provider credentials are configured
- Production email delivery requires external provider credentials
- Test coverage is intentionally small and currently focused on platform contracts

See [PLANISFY_ROADMAP.md](./PLANISFY_ROADMAP.md) for the canonical roadmap, current reality, and credible v1 gate.

## Tech Stack

| Area | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| API gateway | Hono on Node.js |
| Web apps | Next.js 16 + React 19 |
| Auth | better-auth |
| Database | PostgreSQL + Drizzle ORM |
| Rate limiting and queues | Redis, BullMQ, rate-limiter-flexible |
| Tiles | Martin |
| Routing | Valhalla |
| Maps | MapLibre GL JS |
| UI | shared `@planisfy/ui` components |

## Apps

| App | Package | Local URL | Purpose |
| --- | --- | --- | --- |
| Marketing | `apps/marketing` | <https://planisfy.localhost> | Public website |
| Console | `apps/console` | <https://console.planisfy.localhost> | Customer dashboard and style studio |
| Docs | `apps/docs` | <https://docs.planisfy.localhost> | Product and API documentation |
| Admin | `apps/admin` | <https://admin.planisfy.localhost> | Internal/super-admin views |
| API | `apps/api` | <https://api.planisfy.localhost> | Hono API gateway |
| Tile worker | `apps/tile-worker` | N/A | Planned Cloudflare tile delivery |

## Packages

| Package | Purpose |
| --- | --- |
| `@planisfy/auth` | better-auth setup and helpers |
| `@planisfy/database` | Drizzle database client, schema, relations, migrations, and shared server data helpers |
| `@planisfy/types` | shared TypeScript types and plan limits |
| `@planisfy/utils` | shared utilities |
| `@planisfy/ui` | shared UI components |
| `@planisfy/eslint-config` | shared ESLint flat configs |
| `@planisfy/typescript-config` | shared TypeScript configs |
| `@planisfy/prettier-config` | shared Prettier config |

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

Start the local stack from the repository root:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

Run database migrations after Postgres is healthy:

```bash
pnpm -F @planisfy/database db:migrate
```

Default service URLs:

- Marketing: <http://localhost:3000>
- Console: <http://localhost:3001>
- Docs: <http://localhost:3002>
- Admin: <http://localhost:3003>
- API: <http://localhost:4000>
- Martin: <http://localhost:3005>
- Valhalla: <http://localhost:3007>

Local demo assets:

- Planisfy Streets fixture style: `packages/map-styles/styles/planisfy-streets-v1.json`
- Style release manifest: `packages/map-styles/release-manifest.json`
- Martin PMTiles mount: `infra/docker/data/pmtiles`
- Local object storage mount: `infra/docker/data/storage`

Health checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/health/detailed
curl http://localhost:3005/catalog
```

Required production hardening:

- Set a strong `BETTER_AUTH_SECRET`
- Set `INTERNAL_API_SECRET` for `/internal/*` API routes
- Replace default database and Redis credentials
- Configure tile, routing, geocoding, email, storage, and billing providers for the deployment mode you need

More detail is available in [docs/self-hosting.md](./docs/self-hosting.md).

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

No license file is currently included in this repository. Add one before distributing or accepting outside contributions.
