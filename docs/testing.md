# Testing

Use root turbo-backed commands when checking the whole repository:

```bash
pnpm verify
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

The local self-host QA pass also uses:

```bash
SMOKE_BROWSER_PRODUCT_LOOP=true pnpm smoke:self-host-compose
pnpm smoke:self-host-backup-restore
```

These commands write logs, screenshots, and generated fixtures under
`dogfood-output/`.

To exercise S3-compatible storage locally, run the same full product loop with
the `with-minio` Compose profile and these storage settings:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=planisfy-artifacts
S3_REGION=auto
S3_ENDPOINT=http://localhost:9000
CONTAINER_S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=http://localhost:9000/planisfy-artifacts
AWS_ACCESS_KEY_ID=planisfy
AWS_SECRET_ACCESS_KEY=planisfy-local-minio-password
MINIO_ROOT_USER=planisfy
MINIO_ROOT_PASSWORD=planisfy-local-minio-password
```

Then start Compose with `--profile with-minio` and run:

```bash
pnpm e2e:product-loop:full
ENV_FILE=/path/to/minio.env pnpm smoke:self-host-backup-restore
```

The MinIO/S3 runtime path has been proven for uploaded tilesets, published
TileJSON/style rendering, profile avatars, sprite SVG assets, and
backup/restore of the Compose MinIO object store.

Focused commands:

```bash
pnpm --filter docs check-types
pnpm --filter docs lint
pnpm --filter api test
pnpm --filter worker-geodata test
pnpm --filter @planisfy/events test
```

Current tests cover selected route behavior, worker/toolchain contracts, event parsing, storage paths, style/spec helpers, platform policy, and service-specific logic. Browser/product-loop coverage exists as scripts and should be run against a live stack when changing Console flows.

Docs changes should also run `pnpm --filter docs check-types` because Fumadocs generates typed content before TypeScript checks.
