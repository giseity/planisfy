# Planisfy Map Styles

Shared package for default Planisfy basemap style assets.

## Included Fixture Release

Milestone 1/2 includes a small, versioned fixture release for local demo wiring:

| Asset | Path | Purpose |
| --- | --- | --- |
| Planisfy Streets style | `styles/planisfy-streets-v1.json` | MapLibre style pointed at the local Martin tileset `planisfy.basic`. |
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

The style expects OpenMapTiles-like source layers: `landuse`, `water`,
`transportation`, `transportation_name`, `building`, and `place`.

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
node -e "JSON.parse(require('fs').readFileSync('packages/map-styles/styles/planisfy-streets-v1.json','utf8'))"
```
