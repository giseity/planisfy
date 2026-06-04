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
