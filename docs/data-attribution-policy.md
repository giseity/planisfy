# Data Attribution Policy

Planisfy routes return attribution from the configured data source or service where the implementation provides it.

## Current Sources

- Tiles and styles inherit attribution from uploaded tilesets, fixture styles, or configured Martin sources.
- Geocoding responses are Pelias responses from the configured Pelias-compatible service.
- Routing responses are Valhalla responses from the configured graph data.
- Elevation responses identify the configured elevation service; the local service samples SRTM HGT tiles.

Operators are responsible for using source datasets under their licenses and displaying attribution required by those datasets.
