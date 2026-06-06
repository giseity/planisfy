# Data Attribution Policy

Planisfy is a self-hostable maps platform. The AGPL-3.0-only license for this
repository covers the platform code unless a package, directory, or file says
otherwise. It does not replace attribution, license, database-right, or
trademark obligations that apply to map data, styles, sprites, fonts, tiles, or
other assets.

## Operator Responsibilities

Anyone operating Planisfy with third-party data or assets should:

- keep source, license, attribution, and provenance metadata with imported
  datasets and generated artifacts;
- display required attribution in maps, Studio previews, public styles, and
  downstream MapLibre applications;
- preserve required notices in release manifests, TileJSON, style metadata, and
  documentation;
- verify whether data licenses require share-alike, noncommercial limits,
  database-right notices, regional terms, or trademark restrictions;
- avoid implying that Planisfy grants rights to third-party map data or assets.

## Planisfy Fixtures And Basemap Releases

Fixture styles and manifests in `packages/map-styles` are for development,
documentation, and self-host demo workflows. Binary map data is intentionally not
stored in this repository. A future Planisfy basemap release should include a
release manifest with:

- source datasets and versions;
- required attribution text and links;
- style, sprite, font, and tile artifact licenses;
- build date, region, and provenance;
- operator-facing display requirements.

## Uploaded And Imported Data

Uploaded files, remote imports, Overture extracts, Natural Earth data, and other
custom datasets should keep attribution metadata through the product loop:

```text
Source data -> Dataset/import -> Tileset build -> Style -> Publish -> Observe
```

Generated tilesets and styles should not drop attribution merely because data has
been transformed, tiled, cached, or served through Planisfy endpoints.

## Documentation Rule

Docs should distinguish implemented Planisfy behavior from target behavior and
should name external data or runtime dependencies when they affect what a
self-hosted operator is allowed or able to publish.
