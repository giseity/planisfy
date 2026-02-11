# Planisfy Utils

Shared utility functions for the Planisfy platform.

---

## Overview

Provides:
- Coordinate math (conversions, bounds)
- Tile math (XYZ coordinates, mercator projection)
- Validation (input validators with Zod)
- Formatting (response formatters)

---

## Categories

| Category | Purpose |
|----------|---------|
| **Coordinates** | Lat/lng conversions, bounds calculations |
| **Tiles** | Tile coordinate functions, mercator projection |
| **Validation** | Input validators with Zod schemas |
| **Formatting** | Response formatters for API outputs |

---

## Usage

```typescript
import { lngLatToTile, TileCoordsSchema } from '@planisfy/utils';

// Convert coordinates
const tile = lngLatToTile([lon, lat], zoom);

// Validate input
const coords = TileCoordsSchema.parse({ z, x, y });
```

---

## Key Functions

### Coordinates
- `lngLatToTile()` - Convert coordinates to tile
- `tileToLngLat()` - Convert tile to coordinates
- `boundsFromCenter()` - Calculate bounding box
- `pointInBounds()` - Check if point in bounds

### Tiles
- `validTile()` - Validate tile coordinates
- `parentTile()` - Get parent tile
- `childTiles()` - Get child tiles

### Validation
- `TileCoordsSchema` - Zod schema for tiles
- `GeocodingRequestSchema` - Zod schema for geocoding
- `DirectionsRequestSchema` - Zod schema for routing

---

## See Also

- [Packages/types](../types/README.md) - TypeScript types
