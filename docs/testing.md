# Testing

Use root turbo-backed commands when checking the whole repository:

```bash
pnpm check-types
pnpm lint
pnpm test
```

Browser smoke coverage is split into two levels:

```bash
pnpm e2e:product-loop
pnpm e2e:product-loop:full
```

`e2e:product-loop` signs in to a seeded Console account, checks the main
product pages, verifies published integration URLs, and renders the published
style when a seeded PMTiles fixture is available. Set
`PLANISFY_E2E_ALLOW_MISSING_TILESET=true` for non-binary CI runs that do not
ship demo PMTiles data.

`e2e:product-loop:full` uploads a small GeoJSON through the Console, waits for
the geodata worker to build a tileset, publishes the tileset, creates and
publishes a style against it, fetches the public URLs, and renders the result in
MapLibre. Run it against a migrated Compose stack with `worker-geodata` running.

Focused commands:

```bash
pnpm --filter docs check-types
pnpm --filter api test
pnpm --filter worker-geodata test
pnpm --filter @planisfy/events test
```

Current tests cover selected route behavior, worker/toolchain contracts, event parsing, storage paths, style/spec helpers, platform policy, and service-specific logic. Browser/product-loop coverage exists as scripts and should be run against a live stack when changing Console flows.

Docs changes should also run `pnpm --filter docs check-types` because Fumadocs generates typed content before TypeScript checks.
