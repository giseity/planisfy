# Planisfy Architecture

Planisfy is a pnpm/Turborepo monorepo around a Hono API gateway, Next.js web apps, a geodata worker, PostgreSQL, Redis, and open geospatial engines. The platform layer owns identity, API keys, publication state, usage, operations, and storage ledger records; engines such as Martin, Valhalla, Pelias, and the local renderer own specialized map work.

## Runtime Services

```text
Browser apps / API clients
  |
  v
apps/api (Hono)
  |-- PostgreSQL + Drizzle: identity, resources, styles, tilesets, jobs, usage, audit, billing
  |-- Redis: rate limits, quota reservations, BullMQ, worker heartbeat
  |-- Storage: local filesystem, S3, or R2-compatible object storage
  |-- Martin: static PMTiles sources and glyph serving
  |-- Valhalla: directions, isochrones, matching, matrices, optimized trips
  |-- Pelias: forward, reverse, and autocomplete geocoding
  |-- apps/elevation: local SRTM HGT lookup API
  |-- apps/static-renderer: MapLibre PNG rendering
  |
  +-- apps/worker-geodata: upload/import processing through outbox + BullMQ

Optional runtimes
  |-- apps/tile-worker: isolated PMTiles delivery using the shared tile resolver

Next.js apps
  |-- apps/marketing: public site and managed auth entry
  |-- apps/console: authenticated customer workflows and Studio
  |-- apps/admin: internal operations views
  |-- apps/docs: public documentation
```

## Control Flow

1. A user signs in through Better Auth or sends `X-API-Key: pk_...`.
2. Public asset routes optionally attach identity; service routes require API key or session auth.
3. API middleware applies scope checks, domain restrictions, rate limits, monthly quota reservation, and non-blocking usage logging.
4. Console mutations create database records, storage ledger rows, processing jobs, and event outbox entries.
5. `apps/worker-geodata` claims outbox work, runs the toolchain, writes artifacts to storage, updates job state, and emits heartbeat data.
6. Published style and tileset URLs resolve from database publication state. Versioned URLs are immutable; stable URLs resolve to the promoted latest publication.

## Deployment Modes

`DEPLOYMENT_MODE=self_host` and `DEPLOYMENT_MODE=managed` are parsed by `@planisfy/platform-policy` and surfaced in `/setup/preflight`.

- Self-host mode keeps billing, email, supervisor, and cloud storage optional.
- Managed mode expects Dodo Payments, Resend, and R2/S3-compatible storage.
- Both modes use the same API, Console, Admin, worker, and database schema.

## Resource Model

`accounts` is the owner anchor. User-owned resources use `users.id = accounts.id`; organization-owned resources use `organizations.id = accounts.id`. Styles, API keys, tilesets, uploads, usage logs, audit events, and billing rows reference account ownership through `ownerId` or related account columns.

## Public APIs

Implemented public route groups are tiles, styles, fonts/glyphs, geocoding, directions, isochrone, matching, matrix, optimized trips, elevation, and static maps. Sprite paths exist under published style URLs and are served when the published style snapshot includes generated sprite metadata; styles without sprite assets return `404 Sprite not configured`.

## Operations

The API exposes `/health`, `/health/detailed`, `/metrics`, and `/setup/preflight`; production diagnostics require internal authorization except for authenticated Console preflight. Admin and Console provide operations views over jobs, storage, service readiness, upgrade state, usage, and audit data. Backup, restore, support bundle, and optional supervisor scripts are under `scripts/`.
