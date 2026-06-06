# Planisfy Map Styles

Shared package for default Planisfy basemap style assets.

## Included Fixture Release

Milestone 1/2 includes a small, versioned fixture release for local demo wiring:

| Asset | Path | Purpose |
| --- | --- | --- |
| Planisfy Streets light style | `styles/planisfy-streets-light-v1.json` | MapLibre light style pointed at the local Martin tileset `planisfy.basic`. |
| Planisfy Streets dark style | `styles/planisfy-streets-dark-v1.json` | MapLibre dark style pointed at the local Martin tileset `planisfy.basic`. |
| Legacy fixture alias | `styles/planisfy-streets-v1.json` | Backwards-compatible local demo style. |
| Source-layer contract | `source-layer-contract.json` | Human- and machine-readable source-layer assumptions used by the style. |
| JSON schema | `schemas/planisfy-streets-v1.schema.json` | Minimal schema for validating the source-layer contract shape. |
| Release manifest | `release-manifest.json` | Release metadata tying the fixture style, schema, Martin source, and demo data expectation together. |

The fixture is intentionally lightweight. It does not include binary PMTiles,
sprites, or glyph PBF files. Local demos default glyph loading to the MapLibre
demo font endpoint and reserve `sprites/` for future icon releases.

## Local Tileset Assumptions

The default Docker Martin config composes source `stuttgart-base` into tileset
`planisfy.basic`. To render real local tiles, place a compatible file at:

```text
infra/docker/data/pmtiles/stuttgart.pmtiles
```

The style expects the `planisfy-streets-source-layers-v1` contract documented in
`source-layer-contract.json`. Regional fixtures may omit some global layers, but
generated releases should keep the layer names stable.

## Generated Regional Release Metadata

When a compatible regional PMTiles file exists locally, generate ignored release
metadata and a style JSON under `dist/regional/`:

```bash
pnpm -F @planisfy/map-styles build:regional-release -- \
  --name stuttgart \
  --version v1 \
  --pmtiles infra/docker/data/pmtiles/stuttgart.pmtiles \
  --tilejson-url http://localhost:3005/planisfy.basic
```

The command validates the PMTiles header, records size and SHA-256, and writes a
manifest/style pair. It does not copy the PMTiles binary into the package or any
tracked path.

## Owns

- Default MapLibre-compatible style JSON.
- Fixture source-layer contracts and release manifests.
- Future sprite and glyph metadata used by Planisfy basemap styles.
- Basemap style assets that should be versioned with the product.

## Does Not Own

- User draft style mutation logic.
- Publish and rollback behavior.
- Tileset processing.
- Basemap build pipeline orchestration.

## Important Commands

```bash
pnpm -F @planisfy/map-styles lint
pnpm -F @planisfy/map-styles build:release
pnpm -F @planisfy/map-styles build:regional-release -- --pmtiles infra/docker/data/pmtiles/stuttgart.pmtiles
node -e "JSON.parse(require('fs').readFileSync('packages/map-styles/styles/planisfy-streets-v1.json','utf8'))"
```
