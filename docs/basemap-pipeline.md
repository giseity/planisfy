# Basemap And Geodata Pipeline

Planisfy can serve uploaded PMTiles artifacts, configured local PMTiles sources through Martin, and fixture styles from `@planisfy/map-styles`.

## Upload Pipeline

Uploads create storage ledger rows and processing jobs. The geodata worker validates input, converts supported formats, runs Tippecanoe when needed, writes processed artifacts, and updates tileset version state. PMTiles and MBTiles can be handled as tile artifacts; GeoJSON/CSV/Shapefile inputs require the local toolchain for full processing.

## Overture Imports

DuckDB-backed Overture extraction is available when `OVERTURE_RELEASE` is configured. `OVERTURE_PARQUET_URL_TEMPLATE`, source limits, timeout, and experimental-type flags control import behavior.

## Style Fixtures

## Root-Agent Basemap Builds

Basemap builds are separate from Martin. Planetiler builds PMTiles artifacts;
Martin serves activated releases from local serving-machine disk.

The v1 root-agent path supports OSM PBF sources with `engine=planetiler_osm`
and `source_kind=osm_pbf`. Overture basemap builds are represented in the API
model but remain disabled until the layer profile is implemented.

Build output follows the shared lifecycle:

- Build: compute status.
- Artifact: stored PMTiles/MBTiles object.
- Release: named/versioned artifact.
- Activation: artifact installed into Martin sources by a serving root-agent,
  then Martin is restarted or health-checked through runtime-supervisor.
- Primary: active release used as the default basemap.

`packages/map-styles` contains Planisfy Streets fixture styles, source-layer
contract data, schema fixtures, and regional Planetiler scripts.
