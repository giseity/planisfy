# Planisfy API

Mapbox-compatible API gateway built with Fastify.

> **Implementation Status**: 🟡 Package.json created, implementation pending

---

## Overview

The API is the central gateway that:
- Accepts Mapbox-compatible requests
- Validates API keys and enforces rate limits
- Routes requests to appropriate backend engines
- Formats responses to match Mapbox specifications
- Tracks usage for analytics

---

## Endpoints

| API | Endpoint | Purpose | Engine |
|-----|----------|---------|--------|
| **Vector Tiles** | `GET /tiles/v1/{style}/{z}/{x}/{y}` | Serve vector tiles | Martin (Rust) |
| **Style JSON** | `GET /styles/v1/{username}/{style_id}` | Map style specification | Static/API |
| **Sprites** | `GET /styles/v1/{username}/{style_id}/sprite{@2x}` | Map icons | R2/API |
| **Glyphs** | `GET /fonts/v1/{fontstack}/{range}.pbf` | Font glyphs | R2 |
| **Geocoding** | `GET /geocoding/v1/planisfy/places` | Address search | Pelias |
| **Directions** | `GET /directions/v1/planisfy/{profile}/{coords}` | Routing | Valhalla |

---

## Key Features

### Authentication
- API key validation (Bearer token or query param)
- Session validation for dashboard
- Rate limiting per key (Redis-backed)
- Scope enforcement (e.g., key limited to tiles only)

### Request Processing
- Input validation (coordinate bounds, zoom levels)
- Request transformation (Mapbox format → engine format)
- Response transformation (engine format → Mapbox format)
- Error handling and standardization

### Usage Tracking
- Async logging to PostgreSQL
- Request counts per endpoint
- Response time metrics
- Error rate tracking

---

## Tech Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Framework** | Fastify | High performance, TypeScript-first |
| **Auth** | better-auth | API key generation/validation built-in |
| **Rate Limiting** | Redis + fastify-rate-limit | Sliding window, distributed |
| **Database** | Drizzle ORM + PostgreSQL | Type-safe, async queries |
| **Validation** | Zod | Schema validation, TypeScript inference |

---

## Architecture

```
Request → API Gateway → [Auth Check] → [Rate Limit]
                ↓
        [Route to Engine] → [Format Response]
                ↓
        [Log Usage] → Response
```

---

## Development

```bash
pnpm install
pnpm dev      # Port 3003
pnpm check-types
pnpm lint
pnpm build
```

---

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/planisfy
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=your-secret-key
MARTIN_URL=http://localhost:3005
PELIAS_URL=http://localhost:3006
VALHALLA_URL=http://localhost:3007
```

---

## Deployment

### Docker
```bash
docker build -t planisfy-api .
docker run -p 3003:3000 planisfy-api
```

---

## Planned Features

- Isochrones API
- Static Images API
- TileJSON metadata
- Optimization API
