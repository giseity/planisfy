# Resource Model

## Current

Planisfy currently has users, organizations, profiles, styles, style versions, API keys, tileset sources, usage logs, and audit events.

## Target Identity

- `accounts`: canonical owner anchor for users and organizations.
- `users`: Better Auth user identity, same UUID as account.
- `organizations`: Better Auth organization identity, same UUID as account.
- `oauth_accounts`: Better Auth provider credentials.
- `members` and `invitations`: organization membership.

## Target Map Resources

- `uploads`: raw files or remote imports.
- `datasets`: normalized inspectable source data.
- `dataset_versions`: immutable source snapshots when needed.
- `tilesets`: logical tile products.
- `tileset_versions`: immutable tile artifacts.
- `styles`: editable style draft state.
- `style_versions`: immutable style snapshots.
- `style_publications`: publish events, aliases, and rollback history.

## Target Operations Resources

- `processing_jobs`: user-visible async operations.
- `processing_job_logs`: durable job progress and error details.
- `event_outbox`: transactional worker trigger queue.
- `storage_objects`: artifact ledger.
- `usage_logs` and `usage_rollups`: raw and aggregated usage.
- `audit_events`: actor/resource history.

## Rule

Production URLs must resolve to immutable artifacts or explicit stable aliases. Draft edits must not mutate published behavior.
