# Testing

Use root turbo-backed commands when checking the whole repository:

```bash
pnpm check-types
pnpm lint
pnpm test
```

Focused commands:

```bash
pnpm --filter docs check-types
pnpm --filter api test
pnpm --filter worker-geodata test
pnpm --filter @planisfy/events test
```

Current tests cover selected route behavior, worker/toolchain contracts, event parsing, storage paths, style/spec helpers, platform policy, and service-specific logic. Browser/product-loop coverage exists as scripts and should be run against a live stack when changing Console flows.

Docs changes should also run `pnpm --filter docs check-types` because Fumadocs generates typed content before TypeScript checks.
