# Planisfy Database

Drizzle schema, relations, migrations, database client, and shared server-side data helpers.

## Owns

- PostgreSQL schema definitions.
- Drizzle relations.
- Migrations under `drizzle/`.
- Shared database helpers such as style creation and duplication.
- The identity, resource, usage, audit, and alpha source models.

## Current Alpha Tables

- `profiles`
- `users`
- `organizations`
- `members`
- `invitations`
- `sessions`
- `accounts` for Better Auth provider credentials
- `verifications`
- `styles`
- `style_versions`
- `api_keys`
- `tileset_sources`
- `usage_logs`
- `audit_events`

## Target Direction

The restructuring plan resets the schema around:

- `accounts` as the canonical user/org owner anchor.
- `oauth_accounts` for Better Auth provider credentials.
- `uploads`, `datasets`, `tilesets`, `tileset_versions`, `processing_jobs`, `event_outbox`, `storage_objects`, and explicit publication tables.

## Important Commands

```bash
pnpm -F @planisfy/database check-types
pnpm -F @planisfy/database lint
pnpm -F @planisfy/database db:generate
pnpm -F @planisfy/database db:migrate
pnpm -F @planisfy/database db:push
```

## Gotchas

- Soft-delete-aware uniqueness should use partial unique indexes with `WHERE deleted_at IS NULL`.
- Generic ownership should go through the shared owner anchor, not through separate user/org joins.
- The database package should not import frontend code, storage clients, Redis, or HTTP clients.
