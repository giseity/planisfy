# Planisfy Map Styles

Mapbox Style JSON specifications for Overture Maps data.

> **Implementation Status**: 🟡 Package.json created, style definitions pending

---

## Overview

Contains map style definitions for MapLibre GL JS.

**Key Challenge**: Overture Maps uses different schema than OpenStreetMap/Mapbox, so styles must map Overture layers to visual representations.

---

## Styles

| Style | Description |
|-------|-------------|
| **Basic** | Simple street map |
| **Streets** | Detailed streets with POIs |
| **Light** | Minimalist light theme |
| **Dark** | Dark mode theme |
| **Satellite** | Satellite imagery (future) |

---

## Overture Layer Mapping

| Overture Layer | Mapbox Layer |
|---------------|--------------|
| `admins` | `admin` |
| `buildings` | `building` |
| `places` | `place` |
| `transportation` | `road` |
| `water` | `water` |
| `land` | `landuse` |
| `pois` | `poi` |

---

## Components

```
packages/map-styles/
├── styles/     # Style JSON files
├── sprites/    # Map icons (PNG + JSON)
└── glyphs/     # Font glyph files (PBF)
```

---

## See Also

- [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/)
- [Overture Maps Schema](https://overturemaps.org/docs/schema/)
