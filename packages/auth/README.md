# Planisfy Auth

Shared Better Auth configuration and helpers for Planisfy.

## Owns

- Better Auth server configuration.
- Email/password auth.
- Session and organization plugin setup.
- User and organization creation hooks.
- Shared auth client exports for frontend apps.
- Helper functions for active account context.

## Does Not Own

- API key validation; that lives in `apps/api`.
- Billing enforcement.
- Admin authorization policy beyond auth/session primitives.

## Identity Anchor

The current schema uses `accounts` as the shared owner anchor:

- `accounts.id = users.id`
- `accounts.id = organizations.id`

The database package still exports `profiles` as a temporary alpha compatibility alias for existing callers. New code should use `accounts` terminology. Better Auth provider credentials live in `oauth_accounts`.

## Important Commands

```bash
pnpm -F @planisfy/auth check-types
pnpm -F @planisfy/auth lint
```

## Gotchas

- Better Auth inserts the final `users` or `organizations` row after `databaseHooks.*.create.before`; the hook must create the shared anchor row first and return the generated ID.
- Email delivery is best effort in local development and depends on `RESEND_API_KEY`.
