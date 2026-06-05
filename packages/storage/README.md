# Planisfy Storage

Server-side storage provider abstraction for local filesystem and S3/R2-compatible object stores.

## Owns

- Storage provider interface.
- Local filesystem storage implementation.
- Signed S3/R2-compatible storage implementation.
- Provider and bucket metadata used by `storage_objects` ledger rows.

## Cloudflare R2

Use `STORAGE_PROVIDER=r2` and set `R2_ACCOUNT_ID` or `R2_ENDPOINT`,
`R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Set
`R2_PUBLIC_URL` to the production custom domain for public artifact links.

## Does Not Own

- Storage key contracts. Use `@planisfy/storage-paths`.
- Database ledger writes.
- Browser upload UI.

## Commands

```bash
pnpm -F @planisfy/storage check-types
pnpm -F @planisfy/storage lint
```
