# Planisfy Storage

Server-side storage provider abstraction for local filesystem and S3/R2-compatible object stores.

## Owns

- Storage provider interface.
- Local filesystem storage implementation.
- S3/R2-compatible storage implementation.
- Provider and bucket metadata used by `storage_objects` ledger rows.

## Does Not Own

- Storage key contracts. Use `@planisfy/storage-paths`.
- Database ledger writes.
- Browser upload UI.

## Commands

```bash
pnpm -F @planisfy/storage check-types
pnpm -F @planisfy/storage lint
```
