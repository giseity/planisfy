# PMTiles data

Place demo or production `.pmtiles` files here. The default Martin configuration
expects:

- `stuttgart.pmtiles` mounted as source `stuttgart-base`
- stable fixture alias `planisfy.basic`
- immutable fixture alias `planisfy.basic.v1`

The repository does not include binary tile data; this directory is a small
fixture mount point for local self-host demos.

Static Martin sources can still be proxied by the API when they are listed in
`infra/docker/configs/martin.yaml`. Uploaded tilesets use API-owned
`/tiles/v1/{owner}/{handle}` URLs and are read from configured artifact storage,
so MinIO/S3/R2-backed uploads do not require matching direct Martin source
names.
