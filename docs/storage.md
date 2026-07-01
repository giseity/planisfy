# Storage

Planisfy supports `STORAGE_PROVIDER=local`, `s3`, or `r2`.

Self-host deployments default to `STORAGE_PROVIDER=s3` backed by the bundled
MinIO Compose profile. This keeps artifact behavior close to managed S3/R2
storage and supports direct root-agent uploads. Use `STORAGE_PROVIDER=local`
only for demos or small development loops.

## Local

Local storage writes to `LOCAL_STORAGE_PATH`. In Docker Compose the API and worker mount the host path from `LOCAL_STORAGE_HOST_PATH` at `/data/storage`. Public processed tileset artifacts can be read through `/storage/*` only when a matching public `storage_objects` ledger row exists. Local storage cannot issue signed direct upload sessions and is not a planet-scale artifact path.

## S3 And R2

`@planisfy/storage` uses S3-compatible access for both S3 and Cloudflare R2. Configure bucket, endpoint/account, access key, secret, region, and public URL as appropriate. MinIO is available locally through the `with-minio` Compose profile.

For local MinIO through Docker Compose, `.env.example` already provides:

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

## Tile Alias Policy

Local Martin aliases are hardlink-only. `LOCAL_STORAGE_PATH`,
`MARTIN_SOURCES_PATH`, and root-agent Martin runtime sources must be on a
filesystem that supports hardlinks. Planisfy does not silently copy large
PMTiles/MBTiles files as a fallback because that can hide multi-GB or planet
scale disk duplication. S3/R2 aliases are explicit object-storage copies and
record `aliasMode=object_copy` in publish evidence.

## Root-Agent Artifact Uploads

Managed root-agent builds use direct multipart uploads for S3/R2 artifacts:

1. The root-agent asks the API for an artifact upload session.
2. The API creates signed multipart object-storage part URLs.
3. The root-agent uploads artifact parts directly to object storage.
4. The root-agent finalizes through the API with artifact metadata, checksum,
   storage key, upload id, and uploaded part ETags.
5. The API completes the multipart upload and records `storage_objects` plus
   the domain artifact row, such as `routing_graph_artifacts` or
   `basemap_artifacts`.

The API is the control plane for regional and planet routing/basemap artifacts.
It must not proxy multi-GB managed artifacts through public ingress.

Local storage cannot issue signed object-storage uploads. In that mode the
root-agent uses the legacy proxied endpoint as a local fallback for small
self-host smoke artifacts only.
