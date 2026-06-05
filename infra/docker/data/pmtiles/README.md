# PMTiles data

Place demo or production `.pmtiles` files here. The default Martin configuration
expects:

- `stuttgart.pmtiles` mounted as source `stuttgart-base`
- composed tileset `planisfy.basic`
- composed immutable version alias `planisfy.basic.v1`

The repository does not include binary tile data; this directory is a small
fixture mount point for local self-host demos.

The API proxies public tileset URLs to Martin source names. A stable URL such as
`/tiles/v1/acme.roads/0/0/0` expects Martin source `acme.roads`; an immutable URL
such as `/tiles/v1/acme.roads@3/0/0/0` expects Martin source `acme.roads.v3`.
For uploaded tilesets, generate or extend `infra/docker/configs/martin.yaml`
with those source names once the artifact path is known.
