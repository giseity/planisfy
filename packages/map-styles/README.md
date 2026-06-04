# Planisfy Map Styles

Shared package for default Planisfy style assets.

## Owns

- Default MapLibre-compatible style JSON.
- Future sprite and glyph metadata used by Planisfy basemap styles.
- Basemap style assets that should be versioned with the product.

## Does Not Own

- User draft style mutation logic.
- Publish and rollback behavior.
- Tileset processing.
- Basemap build pipeline orchestration.

## Direction

This package should eventually contain `planisfy-streets-light-v1`, `planisfy-streets-dark-v1`, sprite metadata, and documented source-layer assumptions. Validation and style lifecycle helpers belong in `@planisfy/style-spec`.

## Important Commands

```bash
pnpm -F @planisfy/map-styles lint
```
