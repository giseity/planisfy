# Architecture

## Product Shape

Planisfy is a self-hostable maps platform with optional hosted cloud later. The credible v1 product loop is: self-host, see a default map, upload geodata, process it into tiles, style it, publish a stable MapLibre URL, and roll back safely.

## Current System

- `apps/api`: Hono API gateway.
- `apps/console`: customer console and Studio.
- `apps/admin`: internal operations UI.
- `apps/docs`: public and self-host documentation.
- `apps/marketing`: public website.
- `apps/tile-worker`: planned edge tile delivery.
- `apps/worker-geodata`: tileset upload and geodata artifact processing.
- `packages/auth`: Better Auth setup.
- `packages/database`: Drizzle schema and shared DB helpers.
- `packages/types`: broad shared types.
- `packages/utils`: pure utilities.
- `packages/ui`: shared UI components.
- `packages/map-styles`: default style assets.

## Target System

- API owns backend business mutations and public map API routes.
- Console and admin consume API contracts instead of duplicating business rules.
- Heavy geodata work moves to `apps/worker-geodata`.
- Durable async work flows through `event_outbox` and user-visible `processing_jobs`.
- API code produces source-processing jobs; `apps/worker-geodata` consumes and executes them.
- Storage keys are generated through `@planisfy/storage-paths`.
- Server storage providers live in `@planisfy/storage`.
- Async event payloads are validated through `@planisfy/events`.
- Style lifecycle helpers live in `@planisfy/style-spec`.

## Dependency Boundaries

- Pure contract packages must not import database, Redis, HTTP, filesystem, or provider SDKs.
- API and workers can import database and contract packages.
- Next.js apps should not own backend business rules.
- Worker containers can depend on GDAL, Tippecanoe, DuckDB, and other heavy tools; the API image should stay lighter.

## Identity

Planisfy uses `accounts` as the shared owner anchor, with `users.id = accounts.id` and `organizations.id = accounts.id`, following the proven Geobble pattern. Better Auth provider credentials live in `oauth_accounts`. The database package temporarily exports `profiles` as an alias for existing alpha API callers.
