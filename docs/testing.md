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
pnpm smoke:self-host-route-protection
pnpm smoke:self-host-support-bundle
pnpm smoke:self-host-restart-persistence
pnpm smoke:self-host-backup-restore
```

These commands write logs, screenshots, and generated fixtures under
`dogfood-output/`.

Public self-host fixtures can be uploaded to Cloudflare R2 with:

```bash
pnpm fixtures:upload
```

Set `PLANISFY_FIXTURE_BASE_URL` to the public `v1` prefix before running
`scripts/self-host-setup.sh --demo-data`. If that bucket is unavailable, setup
can fall back to `DEMO_PMTILES_FALLBACK_URL`, `DEMO_PMTILES_FALLBACK_PATH`, or
an already-installed local PMTiles file.

Managed mode can be smoked locally against real Cloudflare R2 without using
public HTTPS ingress:

```bash
cat > .env.managed-local <<'EOF'
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
# Optional when Wrangler can discover it: R2_ACCOUNT_ID="..."
# Optional: R2_BUCKET="planisfy-managed-local-smoke"
EOF

pnpm smoke:managed-local
```

This workflow resets the local Compose stack, creates the private R2 smoke
bucket when missing, and runs the managed smoke against `http://localhost:4000`
and `http://localhost:3001`. Billing and email are config smokes only; no Dodo
checkout or ZeptoMail delivery is attempted.

Managed staging has two smoke levels:

```bash
pnpm smoke:managed-staging
MANAGED_STAGING_TEST_EMAIL="..." MANAGED_STAGING_TEST_PASSWORD="..." pnpm smoke:managed-staging-product-loop
```

`smoke:managed-staging` stays a fast public ingress, CORS, provider
configuration, and storage write/read/delete check. The product-loop wrapper
runs the full upload/process/publish/render browser flow against real managed
public URLs and an existing managed test user; it does not seed data or reset
the environment.

Self-host tests default to S3-compatible MinIO. Run the full product loop with
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
