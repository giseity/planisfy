# Planisfy Types

Shared TypeScript type definitions for the Planisfy platform.

---

## Overview

Provides type safety across the monorepo:
- API request/response shapes
- Database model types
- Engine-specific types
- Utility type helpers

---

## Benefits

- ✅ Type safety between API and Dashboard
- ✅ Single source of truth for data structures
- ✅ Better IDE autocomplete
- ✅ Fewer runtime errors

---

## Categories

| Category | Purpose |
|----------|---------|
| **API Types** | Request/response shapes for all endpoints |
| **Database Types** | Generated from Drizzle |
| **Engine Types** | Pelias, Valhalla, Martin types |
| **Utility Types** | Common type helpers |

---

## Usage

```typescript
import type { GeocodingRequest } from '@planisfy/types';

const request: GeocodingRequest = {
  query: search,
  proximity: [lon, lat],
};
```

---

## Type Categories

### API Types
- `tiles.ts` - Tile coordinates, requests
- `geocoding.ts` - Forward/reverse geocoding
- `directions.ts` - Routing profiles, routes
- `common.ts` - Shared API types

### Database Types
- `user.ts` - User, role types
- `api-key.ts` - API key types
- `usage-log.ts` - Usage tracking types

### Engine Types
- `pelias.ts` - Pelias geocoding response
- `valhalla.ts` - Valhalla routing response
- `martin.ts` - Martin tile server types
