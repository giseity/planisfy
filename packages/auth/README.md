# @planisfy/auth

Better Auth configuration, shared auth UI helpers, and auth hooks.

Important config: database URL, auth secrets, OAuth credentials, public auth origin, and optional email settings.

Commands: `pnpm --filter @planisfy/auth check-types`, `lint`.

## API Keys

Planisfy uses Better Auth's API Key plugin for API key hashing, verification,
permissions, metadata, expiration, and enabled/disabled state. Old development
keys from the former `api_keys` table are not migrated; regenerate keys from
the console or rerun `scripts/dev-seed.ts` after applying the cutover migration.
