# Planisfy Style Spec

Shared MapLibre style lifecycle helpers.

## Owns

- MapLibre style validation.
- Draft-to-published style normalization.
- Immutable snapshot helpers.
- Source URL rewriting for published styles.

## Rules

- No database, filesystem, provider SDK, Redis, or HTTP dependencies.
- API owns publish mutations; this package owns pure transformations and validation.

## Commands

```bash
pnpm -F @planisfy/style-spec test
pnpm -F @planisfy/style-spec check-types
pnpm -F @planisfy/style-spec lint
```
