# Basemap Pipeline

## Target

Planisfy should ship a polished default basemap and maintain a reproducible basemap release pipeline.

## Data Sources

- Overture Maps for roads, buildings, places, land, water, and admin data where suitable.
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

`apps/worker-geodata` owns build jobs. DuckDB is acceptable for Overture and Parquet-heavy processing. PostGIS is useful for staging, validation, geometry checks, and metadata extraction.

## Milestone 1/2 Fixture Release

The first infrastructure/docs/assets slice ships a fixture release rather than a
full basemap build pipeline. The release lives in `packages/map-styles` and
contains:

- `styles/planisfy-streets-v1.json` — MapLibre style for the local Martin
  tileset `planisfy.basic`.
- `source-layer-contract.json` — expected source-layer names and required
  properties.
- `schemas/planisfy-streets-v1.schema.json` — JSON schema for the source-layer
  contract document.
- `release-manifest.json` — fixture release metadata and demo data expectations.

The fixture style assumes an OpenMapTiles-like regional PMTiles file at
`infra/docker/data/pmtiles/stuttgart.pmtiles`. Future milestones can replace the
fixture with generated artifacts while keeping the release manifest shape stable.
