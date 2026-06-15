# Storage

Planisfy supports `STORAGE_PROVIDER=local`, `s3`, or `r2`.

## Local

Local storage writes to `LOCAL_STORAGE_PATH`. In Docker Compose the API and worker mount the host path from `LOCAL_STORAGE_HOST_PATH` at `/data/storage`. Public processed tileset artifacts can be read through `/storage/*` only when a matching public `storage_objects` ledger row exists.

## S3 And R2

`@planisfy/storage` uses S3-compatible access for both S3 and Cloudflare R2. Configure bucket, endpoint/account, access key, secret, region, and public URL as appropriate. MinIO is available locally through the `with-minio` Compose profile.

## Artifact Model

The database ledger records provider, bucket, storage key, resource type, artifact kind, and content type. Published tilesets are served through API-owned TileJSON and tile URLs. The API verifies that promoted PMTiles artifacts exist before advertising TileJSON.

Storage key construction belongs in `@planisfy/storage-paths`.
