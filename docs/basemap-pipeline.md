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

## Engine Split

- `apps/worker-geodata` uses Tippecanoe plus GDAL/`ogr2ogr` for ad hoc upload
  tiling.
- `apps/worker-geodata` uses DuckDB for Overture/source import extraction from
  GeoParquet.
- `packages/map-styles` owns the Planetiler regional basemap build harness and
  release metadata packaging.
- Future global basemap jobs can move into a scheduler/worker once the regional
  release loop is stable. PostGIS remains useful for staging, validation,
  geometry checks, and metadata extraction.

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
- `planetiler/planisfy-streets-regional.yml` - minimal Planetiler custom-map
  profile for regional Planisfy Streets builds.
- `fixtures/regional/planisfy-streets-fixture.geojson` - tiny tracked source
  fixture used by the Planetiler harness and tests.

Validate and package release metadata with:

```bash
pnpm -F @planisfy/map-styles test
pnpm -F @planisfy/map-styles build:release
pnpm -F @planisfy/map-styles build:planetiler-regional -- --name fixture --version dev
```

The fixture style assumes an OpenMapTiles-like regional PMTiles file at
`infra/docker/data/pmtiles/stuttgart.pmtiles`. The Planetiler regional harness
can also generate ignored PMTiles under `packages/map-styles/dist/regional/`
from the tracked fixture profile, then write manifest/style metadata through
`build:regional-release`. This is a reproducibility harness, not the polished
global basemap.

## Data Access Notes

- Overture publishes monthly releases as cloud-hosted GeoParquet datasets under
  theme/type partitions, with inspection PMTiles available per release.
- Natural Earth provides low-zoom vector/raster map data at 1:10m, 1:50m, and
  1:110m scales.
- Generated global Planisfy Streets releases should record exact upstream
  release versions in `basemap_releases.source_data_versions` and in the
  package release manifest.
