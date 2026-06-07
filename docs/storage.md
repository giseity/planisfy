# Storage

## Current

Planisfy has a local/S3-like storage abstraction in the API. Tileset uploads now use `@planisfy/storage-paths` and write `storage_objects` ledger rows for original and processed artifacts.

## Target

Storage is built from:

- `@planisfy/storage-paths` for object key builders and parsers.
- `@planisfy/storage` for server-side local and S3/R2-compatible providers.
- `storage_objects` as the durable artifact ledger.
- A local filesystem provider for simple self-hosting.
- An S3/R2-compatible provider for cloud and advanced self-hosting.
- An optional MinIO Docker profile for local S3-compatible testing.

## Storage Object Fields

- account ID
- provider and bucket
- storage key
- file name
- content type
- size
- content hash when available
- resource type and resource ID
- artifact kind
- version
- deleted timestamp
- metadata

## Rules

- Do not construct storage keys inline in route handlers.
- Every durable artifact should have a ledger row.
- Cleanup should be auditable and recoverable.
- Published tileset URLs should reference a promoted `tileset_versions` row, not a raw upload.
- Martin must expose the promoted artifact under the source name expected by the API proxy, such as `owner.tileset` for stable URLs and `owner.tileset.v3` for immutable version URLs.

## Cloudflare R2

Managed deployments use `STORAGE_PROVIDER=r2` with a Cloudflare R2-compatible
bucket. Configure:

- `R2_ACCOUNT_ID` or `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL` for the bucket custom domain used in admin/API artifact URLs
- `MARTIN_SOURCES_PREFIX`, defaulting to `martin-sources`

Managed readiness treats local storage and plain S3 storage as unavailable for
v1. Self-host deployments may still use local storage by default or opt into S3
or R2-compatible storage.

R2 writes are signed through the S3-compatible API. When a PMTiles/MBTiles
tileset version is published, Planisfy copies the immutable artifact to stable
and versioned alias objects:

- `martin-sources/{owner}.{tileset}.pmtiles`
- `martin-sources/{owner}.{tileset}.v{version}.pmtiles`

Martin should be configured to scan that prefix from the R2 bucket so the API
tile proxy can continue using the stable `owner.tileset` and immutable
`owner.tileset.v{version}` source names. Use an R2 custom domain for production
artifact URLs; avoid `r2.dev` for production traffic.

## Local MinIO

Use the Docker Compose `with-minio` profile to test S3-style storage locally:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
```

Recommended local values:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=planisfy-artifacts
S3_REGION=auto
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_URL=http://localhost:9000/planisfy-artifacts
AWS_ACCESS_KEY_ID=planisfy
AWS_SECRET_ACCESS_KEY=planisfy-local-minio-password
```

MinIO is useful for validating upload processing, artifact backups, and Martin
source alias copies before moving to managed S3 or R2.

## Backups And Restore

Self-host backups copy durable local data from the Compose mounts rather than
only database rows. `scripts/self-host-backup.sh` captures PostgreSQL, Redis
when reachable, local object storage, PMTiles, Valhalla data, and backup
metadata. `scripts/self-host-restore.sh --confirm` restores those artifacts and
is used by the local-only supervisor rollback flow.

Artifact backups created from the Console Operations page are narrower: they
copy a selected storage object into backup storage for workflow-level recovery.
They do not replace the full self-host backup required before release upgrades.
