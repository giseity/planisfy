# Basemap Pipeline

## Target

Planisfy should ship a polished default basemap and maintain a reproducible
basemap release pipeline.

## Data Sources

- Overture Maps for roads, buildings, places, land, water, and admin data where
  suitable.
- Natural Earth for low-zoom global context.
- Optional OSM enrichment for gaps.

## Pipeline Requirements

- Regional fixtures for fast tests.
- Global release build path.
- Source-layer schema documentation.
- Label ranking.
- Geometry simplification.
- Tile size validation.
- PMTiles artifacts.
- Release manifests.
- Attribution metadata.

## Ownership

`apps/worker-geodata` owns build jobs. DuckDB is acceptable for Overture and
Parquet-heavy processing. PostGIS is useful for staging, validation, geometry
checks, and metadata extraction.

## Fixture Release

The current release is a fixture release rather than a full global basemap build
pipeline. The release lives in `packages/map-styles` and contains:

- `styles/planisfy-streets-light-v1.json` - light MapLibre style for the local
  Martin tileset `planisfy.basic`.
- `styles/planisfy-streets-dark-v1.json` - dark MapLibre style for the local
  Martin tileset `planisfy.basic`.
- `styles/planisfy-streets-v1.json` - backwards-compatible fixture alias.
- `source-layer-contract.json` - expected source-layer names and required
  properties.
- `schemas/planisfy-streets-v1.schema.json` - JSON schema for the source-layer
  contract document.
- `release-manifest.json` - fixture release metadata and demo data expectations.

Validate and package release metadata with:

```bash
pnpm -F @planisfy/map-styles test
pnpm -F @planisfy/map-styles build:release
```

The fixture style assumes an OpenMapTiles-like regional PMTiles file at
`infra/docker/data/pmtiles/stuttgart.pmtiles`. Future milestones can replace the
fixture with generated artifacts while keeping the release manifest shape
stable.

## Data Access Notes

- Overture publishes monthly releases as cloud-hosted GeoParquet datasets under
  theme/type partitions, with inspection PMTiles available per release.
- Natural Earth provides low-zoom vector/raster map data at 1:10m, 1:50m, and
  1:110m scales.
- Generated global Planisfy Streets releases should record exact upstream
  release versions in `basemap_releases.source_data_versions` and in the
  package release manifest.
