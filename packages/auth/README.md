# @planisfy/auth

Better Auth server configuration, shared auth UI, and browser auth hooks.

Important config: database URL, auth secrets, OAuth credentials, public auth origin, and optional email settings.

Commands: `pnpm --filter @planisfy/auth check-types`, `lint`.

## Entrypoints

- `@planisfy/auth/server`: server-only Better Auth instance and server helpers.
- `@planisfy/auth/client`: browser Better Auth client and React session hooks.
- `@planisfy/auth/ui`: browser auth forms and UI helpers.

Do not add a root barrel export. Keeping server and client entrypoints separate
prevents Node-only auth code from being pulled into browser bundles.

## API Keys

Planisfy uses Better Auth's API Key plugin for API key hashing, verification,
permissions, metadata, expiration, and enabled/disabled state. Old development
keys from the former `api_keys` table are not migrated; regenerate keys from
the console or rerun `scripts/dev-seed.ts` after applying the cutover migration.
