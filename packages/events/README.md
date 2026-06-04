# Planisfy Events

Pure event contract package for async work.

## Owns

- Zod schemas for known event payloads.
- TypeScript payload types.
- Unknown-event and invalid-payload errors.
- Parsing helpers used by API and workers.

## Rules

- No database, Redis, filesystem, provider SDK, or HTTP dependencies.
- Event docs and schemas must stay in sync.
- Workers must parse payloads before handling them.

## Commands

```bash
pnpm -F @planisfy/events test
pnpm -F @planisfy/events check-types
pnpm -F @planisfy/events lint
```
