# Planisfy Auth

Shared Better Auth configuration and helpers for Planisfy.

## Owns

- Better Auth server configuration.
- Email/password auth.
- Session and organization plugin setup.
- User and organization creation hooks.
- Shared auth client exports for frontend apps.
- Helper functions for active profile/account context.

## Does Not Own

- API key validation; that lives in `apps/api`.
- Billing enforcement.
- Admin authorization policy beyond auth/session primitives.

## Identity Anchor

The current alpha schema uses `profiles` as the shared owner anchor:

- `profiles.id = users.id`
- `profiles.id = organizations.id`

The restructuring plan renames this anchor to `accounts` and renames Better Auth's OAuth provider table to `oauth_accounts`, following the Geobble pattern.

## Important Commands

```bash
pnpm -F @planisfy/auth check-types
pnpm -F @planisfy/auth lint
```

## Gotchas

- Better Auth inserts the final `users` or `organizations` row after `databaseHooks.*.create.before`; the hook must create the shared anchor row first and return the generated ID.
- Email delivery is best effort in local development and depends on `RESEND_API_KEY`.
