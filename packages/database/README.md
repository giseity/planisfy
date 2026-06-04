# Planisfy Database

Drizzle schema, relations, migrations, database client, and shared server-side data helpers.

## Owns

- PostgreSQL schema definitions.
- Drizzle relations.
- Migrations under `drizzle/`.
- Shared database helpers such as style creation and duplication.
- The identity, resource, usage, audit, and alpha source models.

## Current Tables

- `accounts` as the canonical user/org owner anchor
- `users`
- `organizations`
- `members`
- `invitations`
- `sessions`
- `oauth_accounts` for Better Auth provider credentials
- `verifications`
- `styles`
- `style_versions`
- `style_publications`
- `api_keys`
- `tileset_sources`
- `uploads`
- `datasets`
- `dataset_versions`
- `tilesets`
- `tileset_versions`
- `processing_jobs`
- `processing_job_logs`
- `event_outbox`
- `storage_objects`
- `basemap_releases`
- `usage_logs`
- `usage_rollups`
- `audit_events`
- `billing_customers`
- `plans`
- `subscriptions`
- `billing_transactions`

## Target Direction

The restructuring reset moved the schema around:

- `accounts` as the canonical user/org owner anchor.
- `oauth_accounts` for Better Auth provider credentials.
- `uploads`, `datasets`, `tilesets`, `tileset_versions`, `processing_jobs`, `event_outbox`, `storage_objects`, and explicit publication tables.
- A temporary `profiles` export still points at `accounts` so alpha API callers can be renamed incrementally.

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
