# Planisfy Architecture

Planisfy is a TypeScript monorepo for a Mapbox-compatible geospatial API platform. The platform layer provides authentication, API keys, rate limits, usage tracking, style management, and administrative UI around open geospatial engines.

## System Shape

```text
Client apps and SDKs
        |
        v
Planisfy API (Hono)
        |
        +-- PostgreSQL + Drizzle: users, orgs, keys, styles, usage, audit
        +-- Redis: rate limits, quotas, async queues
        +-- Martin: vector/raster tile serving
        +-- Valhalla: routing, isochrones, matching, matrices
        +-- Pelias-compatible geocoder: forward/reverse/autocomplete geocoding
        +-- Static map renderer: optional external render service

Planisfy Marketing/Console/Admin/Docs (Next.js)
        |
        +-- better-auth session cookies
        +-- direct server-side database reads where appropriate
        +-- `/api/v1/*` rewrites to the Hono API for console API calls
```

## Monorepo Layout

| Path | Responsibility |
| --- | --- |
| `apps/api` | Hono API gateway for public map APIs, auth handler, internal platform routes, and console API routes |
| `apps/console` | Customer console, operations pages, and route-grouped MapLibre style studio |
| `apps/admin` | Internal admin dashboard |
| `apps/marketing` | Public website and managed-mode auth entry surface |
| `apps/docs` | Fumadocs/Next documentation app |
| `apps/tile-worker` | Placeholder for planned Cloudflare/R2 edge tile delivery worker |
| `apps/worker-geodata` | Local geodata worker for upload tiling, source imports, and artifact processing |
| `packages/auth` | better-auth instance, organization hooks, email hook delegation |
| `packages/credentials` | Shared encrypted credential envelope helpers |
| `packages/database` | Drizzle client, schema, migrations, relations, and shared server data helpers |
| `packages/geodata-contracts` | Shared geodata queue names, heartbeat keys, and source-processing job contracts |
| `packages/types` | Shared platform types and plan limits |
| `packages/platform-policy` | Shared deployment-mode capability policy for self-host and managed |
| `packages/upgrade-manifest` | Self-host upgrade release manifest schema and policy helpers |
| `packages/ui` | Shared React UI components |
| `infra/docker` | Local/self-host Docker Compose stack and engine configs |

## API Gateway

The API gateway is implemented with Hono on Node.js.

Public map routes pass through this middleware chain:

1. API key extraction and validation
2. API key or session authentication
3. Plan-aware rate limiting and quota checks
4. Non-blocking usage log enqueueing

Public route categories:

- Tiles and TileJSON via Martin
- Styles, sprites, glyphs, and fonts
- Geocoding via a required Pelias-compatible service
- Directions, isochrones, matching, matrices, and optimized trips via Valhalla
- Elevation via external elevation provider
- Static maps via optional render service

Console routes under `/console/*` require a session cookie.

Internal routes under `/internal/*` are for platform-to-platform calls such as email delivery. They require `X-Internal-Secret` when `INTERNAL_API_SECRET` is configured, and production deployments must configure it.

Geodata job contracts are shared through `@planisfy/geodata-contracts` so API, Admin, and worker retry paths agree on source-processing inputs, source-resource mapping, queue names, and worker heartbeat keys.

## Data Model

The central data model uses `accounts` as a shared owner anchor:

- `accounts.id = users.id` for user-owned resources
- `accounts.id = organizations.id` for organization-owned resources

Resources reference `accounts.id` through ownership columns such as `ownerId` or `accountId`, which lets the same style/API-key/source/usage/audit flows work for individual users and organizations. The database package still exports `profiles` as a temporary alpha compatibility alias for `accounts`; new code should use account naming.

Important tables:

- `accounts`
- `users`
- `organizations`
- `members`
- `invitations`
- `sessions`
- `verifications`
- `styles`
- `style_versions`
- `api_keys`
- `tileset_sources`
- `usage_logs`
- `audit_events`

## Auth

Planisfy uses better-auth for email/password sessions and organization membership. The auth package owns the better-auth instance and hooks.

The API gateway validates better-auth session cookies directly against the sessions table for cross-origin console/API development ergonomics. API keys use SHA-256 hashes of the full key and can be scoped by API category.

`NEXT_PUBLIC_AUTH_ORIGIN` is the canonical auth origin. The server derives the
Better Auth handler URL from it, and frontend redirects use it directly:
self-host and local installs set it to the Console origin, while managed
deployments point it at the public Marketing origin. The same auth UI
components are shared by Marketing managed auth pages and Console self-host
fallback auth pages.

## Web Navigation

The web apps are split into three primary surfaces:

- Marketing/public owns public entry pages and managed-mode sign-in/sign-up/reset.
- Console owns authenticated customer workflows: dashboard, styles, tilesets,
  keys, usage, operations, organization/team/billing, settings, and platform
  readiness.
- Admin remains a separate internal operations app with its own navigation tree.

Studio is implemented as a Next.js route group in Console. Studio URLs are
`/styles`, `/styles/[styleId]`, and `/tilesets`.

## Console Data Access

The console uses a hybrid model:

- Client-side console API calls go through `/api/v1/*` rewrites to the Hono API.
- Server actions and server components may access the database directly for colocated dashboard operations.
- Shared style mutation helpers live in `@planisfy/database` to keep server actions and API routes from drifting.

## Self-Hosted Runtime

`infra/docker/docker-compose.yml` runs:

- API
- Console
- Admin
- Docs
- Marketing
- PostgreSQL
- Redis
- Martin
- Valhalla
- Optional Traefik profile

The compose stack assumes local geospatial data exists under `infra/docker/data/*`. Without that data, Martin and Valhalla may start but will not serve useful map/routing results.

## Current Limitations

- Static map generation returns `501` unless `STATIC_MAP_URL` points at a renderer.
- Geocoding requires a Pelias-compatible service for production quality.
- Tile delivery through Cloudflare/R2 is planned but not fully wired in this repository.
- Test coverage is early and focused on core platform contracts.
- Billing, email, and storage paths require external provider credentials for production use.

## Operational Notes

- Use `pnpm check-types`, `pnpm lint`, and `pnpm test` before merging.
- Use strong production values for `BETTER_AUTH_SECRET` and `INTERNAL_API_SECRET`.
- Avoid exposing `/internal/*` routes without network controls and the shared secret.
- Treat this architecture as alpha and evolving.
