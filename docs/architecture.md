# Architecture

## Product Shape

Planisfy is a maps platform with two official v1 modes: `self_host` and
`managed`. Both modes share the same API/resource/publishing/usage core; the
mode boundary lives in `@planisfy/platform-policy` and is exposed through
`/setup/preflight` capability records.

The credible v1 product loop is: sign up or self-host, see a default map, upload
geodata, process it into tiles, style it, publish a stable MapLibre URL, observe
usage, and roll back or recover safely.

## Current System

- `apps/api`: Hono API gateway.
- `apps/console`: customer console, route-backed operations pages, and Studio.
- `apps/admin`: internal operations UI with its own navigation tree.
- `apps/docs`: public and self-host documentation.
- `apps/marketing`: public website and managed auth entry surface.
- `apps/tile-worker`: placeholder for planned edge tile delivery.
- `apps/worker-geodata`: tileset upload and geodata artifact processing.
- `packages/auth`: Better Auth setup.
- `packages/credentials`: shared encrypted credential envelope helpers.
- `packages/database`: Drizzle schema and shared DB helpers.
- `packages/geodata-contracts`: geodata queue names, heartbeat keys, and worker job input contracts.
- `packages/types`: broad shared types.
- `packages/upgrade-manifest`: self-host upgrade release manifest schema and policy helpers.
- `packages/utils`: pure utilities.
- `packages/ui`: shared UI components.
- `packages/map-styles`: default style assets.

## Target System

- API owns backend business mutations and public map API routes.
- Console and admin consume API contracts instead of duplicating business rules.
- Heavy geodata work moves to `apps/worker-geodata`.
- Durable async work flows through `event_outbox` and user-visible `processing_jobs`.
- API code produces source-processing jobs; `apps/worker-geodata` consumes and executes them.
- Source-processing job inputs, retry source mapping, queue names, and heartbeat keys live in `@planisfy/geodata-contracts`.
- Encrypted operational credential envelopes live in `@planisfy/credentials`.
- Self-host upgrade release manifests live in `@planisfy/upgrade-manifest`.
- Storage keys are generated through `@planisfy/storage-paths`.
- Server storage providers live in `@planisfy/storage`.
- Async event payloads are validated through `@planisfy/events`.
- Style lifecycle helpers live in `@planisfy/style-spec`.

## Dependency Boundaries

- Pure contract packages must not import database, Redis, HTTP, filesystem, or provider SDKs.
- API and workers can import database and contract packages.
- Next.js apps should not own backend business rules.
- Worker containers can depend on GDAL, Tippecanoe, DuckDB, and other heavy tools; the API image should stay lighter.

## Web App Boundaries

Marketing/public, Console, and Admin are separate surfaces. Managed deployments
mount sign-in, sign-up, and reset-password on Marketing through shared auth UI.
Self-host and local development keep Console-local auth pages as the default
fallback. `BETTER_AUTH_URL` identifies the server auth handler; client redirects
use `NEXT_PUBLIC_AUTH_ORIGIN`.

Console navigation is driven by a route manifest. Studio is implemented as a
route group, so Studio URLs are `/styles`, `/styles/[styleId]`, and `/tilesets`.

Shared UI primitives live in `@planisfy/ui`. App shells, breadcrumbs, sidebars,
alerts, alert dialogs, loading/empty states, metrics, comboboxes, tables, and
charts should be built from the shared primitives first; app-specific components
should compose them rather than reimplement them.

## Identity

Planisfy uses `accounts` as the shared owner anchor, with `users.id = accounts.id` and `organizations.id = accounts.id`, following the proven Geobble pattern. Better Auth provider credentials live in `oauth_accounts`. The database package temporarily exports `profiles` as an alias for existing legacy API callers.
