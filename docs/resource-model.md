# Resource Model

`accounts` is the owner anchor for user and organization resources.

## Ownership

- User-owned resources use `users.id = accounts.id`.
- Organization-owned resources use `organizations.id = accounts.id`.
- Membership and active organization context determine the effective owner for session-backed requests.
- API-key requests use the key owner as the owner context.

## Main Resources

Important resource families include styles, style versions, style publications, API keys, uploads, tilesets, tileset versions, processing jobs, event outbox rows, storage objects, usage logs, audit events, billing customers, subscriptions, and transactions.

New resource code should prefer account ownership and shared database helpers over separate user/org branches.
