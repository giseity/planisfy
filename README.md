# Planisfy

Planisfy is a TypeScript geospatial API platform for publishing MapLibre styles, vector tiles, and related map services on open-source engines. The repository contains the API gateway, Console, Admin, Docs, local geodata worker, self-hosting stack, and shared packages.

The product supports two configured deployment modes:

- `self_host`: local or customer-managed infrastructure. Billing, email, supervisor, and object storage are optional.
- `managed`: hosted operation. Billing, email, and R2/S3-compatible object storage are required by policy.

This README describes what is implemented in this repository today. Known launch-readiness gates and future work live in [PLANISFY_ROADMAP.md](./PLANISFY_ROADMAP.md), and the operator checklist lives in [docs/v1-trust-checklist.md](./docs/v1-trust-checklist.md).

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
| `apps/tile-worker` | Optional PMTiles delivery runtime that reuses the shared tile resolver; the API serves tiles directly by default. |
| `packages/*` | Shared auth, database, env, event, storage, style, policy, UI, and tooling packages. |
| `infra/docker` | Docker Compose stack, engine configs, and ignored runtime data mounts. |
| `docs` | Durable contributor and operator references. |

## Application Boundaries

Planisfy keeps user-facing app surfaces behind explicit package and HTTP
contracts. The Console should call the API through `@planisfy/api-contracts` and
its local API client, and should not import API route internals, the database
package, or Drizzle directly. The Console ESLint config enforces this boundary;
the only allowed server-auth exception is the Next.js auth route adapter.

Admin is an internal operator surface and may depend on server-side packages
such as `@planisfy/database` when it needs direct control-plane access. Shared
runtime behavior that crosses apps should live in a package under `packages/*`
or behind an API route rather than as app-to-app imports.

## Implemented Public API Surface

The API gateway mounts these route groups:

- Published assets: `/tiles/*`, `/styles/v1/*`, and `/fonts/*`. Missing auth is allowed for public published assets; valid API keys or sessions are still accepted for metering and private-owner access.
- Service APIs: `/geocoding/*`, `/directions/*`, `/isochrone/*`, `/matching/*`, `/matrix/*`, `/optimized-trips/*`, `/elevation/*`, and `/static/*`. These require `X-API-Key` or a valid session.
- Console APIs: `/console/*`. These require a session cookie.
- Internal routes: `/internal/*` and `/webhooks/dodo`. Internal routes use `INTERNAL_API_SECRET`; the Dodo webhook verifies the configured webhook secret.
- Health and support endpoints: `/health`, `/health/detailed`, `/metrics`, `/setup/preflight`, and public local storage reads under `/storage/*`. In production, `/health/detailed`, `/metrics`, and root `/setup/preflight` require internal authorization; the Console-mounted preflight route remains available to authenticated Console sessions.

External geospatial engines are optional only in the sense that the process can start without useful data. Geocoding needs Pelias, routing needs Valhalla graph data, tiles need Martin or uploaded PMTiles artifacts, elevation needs DEM tiles, and static maps need the static renderer.

## Launch Readiness

For self-hosted trials, the Compose stack is expected to boot with degraded health when datasets are missing. Before calling a deployment production-ready, run the checks in [docs/v1-trust-checklist.md](./docs/v1-trust-checklist.md) and verify the current V1 gates in [PLANISFY_ROADMAP.md](./PLANISFY_ROADMAP.md).

Managed-mode production launch still depends on proving provider configuration, billing and email flows, object storage, ingress/secrets, operational runbooks, and broader browser smoke coverage against a live stack.

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

### TypeScript and module conventions

Planisfy keeps workspace packages and apps on ESM by default with
`"type": "module"`. Node services use TypeScript directly in development, but
production starts compiled JavaScript from `dist/` after `tsup` builds. Next.js
apps keep TypeScript source because Next owns compilation for client and server
code. Next app `next-env.d.ts` files are generated by Next and intentionally
ignored; each Next app's `check-types` script runs `next typegen` before `tsc`.

Shared TypeScript presets live in `packages/typescript-config`:

| Preset | Use |
| --- | --- |
| `source-package.json` | Internal source packages checked by `tsc --noEmit`. |
| `react-library.json` | Reusable React packages. |
| `nextjs.json` | Next.js apps. |
| `node-service.json` | Hono APIs, workers, CLIs, and other Node services. |

Only add package-specific compiler overrides when the runtime genuinely needs
them, such as DOM types for the Playwright-backed static renderer.

## Self-Host Quick Path

From the repository root:

```bash
cp .env.example .env
pnpm self-host:setup
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm db:migrate
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
