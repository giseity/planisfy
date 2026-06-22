# Storage

Planisfy supports `STORAGE_PROVIDER=local`, `s3`, or `r2`.

## Local

Local storage writes to `LOCAL_STORAGE_PATH`. In Docker Compose the API and worker mount the host path from `LOCAL_STORAGE_HOST_PATH` at `/data/storage`. Public processed tileset artifacts can be read through `/storage/*` only when a matching public `storage_objects` ledger row exists.

## S3 And R2

`@planisfy/storage` uses S3-compatible access for both S3 and Cloudflare R2. Configure bucket, endpoint/account, access key, secret, region, and public URL as appropriate. MinIO is available locally through the `with-minio` Compose profile.

For local MinIO through Docker Compose, use:

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

`S3_ENDPOINT` is the host-visible endpoint. `CONTAINER_S3_ENDPOINT` is the
endpoint used by API and worker containers on the Compose network.

When using the Compose `with-minio` profile, `scripts/self-host-backup.sh` and
`scripts/self-host-restore.sh` archive and restore `infra/docker/data/minio`
alongside the database and other local data directories.

## Artifact Model

The database ledger records provider, bucket, storage key, resource type, artifact kind, and content type. Published tilesets are served through API-owned TileJSON and tile URLs. The API verifies that promoted PMTiles artifacts exist before advertising TileJSON.

Storage key construction belongs in `@planisfy/storage-paths`.
