# Basemap And Geodata Pipeline

Planisfy can serve uploaded PMTiles artifacts, configured local PMTiles sources through Martin, and fixture styles from `@planisfy/map-styles`.

## Upload Pipeline

Uploads create storage ledger rows and processing jobs. The geodata worker validates input, converts supported formats, runs Tippecanoe when needed, writes processed artifacts, and updates tileset version state. PMTiles and MBTiles can be handled as tile artifacts; GeoJSON/CSV/Shapefile inputs require the local toolchain for full processing.

## Overture Imports

DuckDB-backed Overture extraction is available when `OVERTURE_RELEASE` is configured. `OVERTURE_PARQUET_URL_TEMPLATE`, source limits, timeout, and experimental-type flags control import behavior.

## Style Fixtures

`packages/map-styles` contains Planisfy Streets fixture styles, source-layer contract data, schema fixtures, and regional Planetiler scripts. Global managed basemap release packaging is not shipped in this repository today.
