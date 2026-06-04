# Planisfy Utils

Pure shared utilities for the Planisfy monorepo.

## Owns

- Small framework-free helper functions.
- Utilities that have no database, Redis, HTTP, storage, or frontend dependencies.

## Does Not Own

- Service clients.
- Storage providers.
- Billing integrations.
- Event schemas.
- Style lifecycle logic.

## Current Exports

- `usage-writer` helpers used by the API usage pipeline.

## Important Commands

```bash
pnpm -F @planisfy/utils check-types
pnpm -F @planisfy/utils lint
```

## Gotchas

- If a helper needs IO, provider credentials, or app configuration, it probably belongs in a domain package or app-specific `lib/` directory instead.
