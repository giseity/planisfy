# Planisfy Types

Shared TypeScript types for broad platform concepts.

## Owns

- Lightweight cross-package type exports.
- Plan and quota types.
- Inferred database model types exported from `@planisfy/database`.

## Does Not Own

- Event payload contracts; those belong in `@planisfy/events`.
- Storage key contracts; those belong in `@planisfy/storage-paths`.
- MapLibre style lifecycle helpers; those belong in `@planisfy/style-spec`.

## Direction

This package should stay narrow. Prefer domain-specific contract packages over turning `@planisfy/types` into a broad bucket for every shared type.

## Important Commands

```bash
pnpm -F @planisfy/types check-types
pnpm -F @planisfy/types lint
```
