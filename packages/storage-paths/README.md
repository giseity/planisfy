# Planisfy Storage Paths

Pure storage key contract package.

## Owns

- Object key builders.
- Known path parsers.
- Path segment safety.
- Prefix helpers for listing account or resource artifacts.

## Rules

- No provider SDKs, filesystem access, database access, or HTTP calls.
- Route handlers and workers should call these builders instead of interpolating object keys inline.

## Commands

```bash
pnpm -F @planisfy/storage-paths test
pnpm -F @planisfy/storage-paths check-types
pnpm -F @planisfy/storage-paths lint
```
