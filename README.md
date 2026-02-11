# Planisfy

> A self-hosted, scalable Mapbox-compatible API platform built with Turborepo.

**Planisfy** provides drop-in Mapbox API compatibility using open-source geospatial engines. Host it yourself for full data sovereignty, or use our managed SaaS.

---

## What is Planisfy?

Planisfy is a Mapbox alternative that:

- **Mapbox API Compatible** - Switch by changing one URL
- **Self-Hostable** - Run on your own infrastructure
- **Open Source Core** - Built on Martin, Pelias, Valhalla, Overture Maps
- **Full Featured** - Tiles, geocoding, routing, styles, dashboard

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Martin    │      │   Pelias    │      │  Valhalla   │
│  (Tiles)    │      │ (Geocoding) │      │  (Routing)   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │  Planisfy API     │
                  │  Authentication   │
                  │  Rate Limiting    │
                  │  Usage Tracking   │
                  └─────────┬─────────┘
                            │
                  ┌─────────▼─────────┐
                  │   Your App        │
                  │  (MapLibre GL JS) │
                  └───────────────────┘
```

---

## Features

### Core APIs

| API | Description | Status |
|-----|-------------|--------|
| **Vector Tiles** | Protocol Buffer vector tiles | ✅ Stable |
| **Style JSON** | MapLibre style specifications | ✅ Stable |
| **Sprites & Glyphs** | Map icons and text rendering | ✅ Stable |
| **Geocoding** | Forward/reverse address search | ✅ Stable |
| **Directions** | Turn-by-turn routing | ✅ Stable |

### Platform Features

| Feature | Description | Status |
|---------|-------------|--------|
| **API Key Authentication** | Bearer token or query param | ✅ Stable |
| **Rate Limiting** | Per-key RPM limits | ✅ Stable |
| **Usage Analytics** | Request tracking, charts | ✅ Stable |
| **Role-Based Access** | User/Admin roles | ✅ Stable |
| **User Dashboard** | API key management, usage views | ✅ Stable |

### In Progress

- Isochrones API (time-distance polygons)
- Static Images API (PNG map snapshots)
- TileJSON metadata endpoints
- Custom map styles in dashboard
- Data export as CSV

---

## Quick Start

### Option A: Use Planisfy SaaS

1. Create account at https://planisfy.com
2. Get your API key from dashboard
3. Replace Mapbox URL:

```javascript
// Before (Mapbox)
map.setStyle('https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=KEY')

// After (Planisfy)
map.setStyle('https://api.planisfy.com/styles/v1/planisfy/basic?access_token=KEY')
```

### Option B: Self-Host

```bash
# Clone repository
git clone https://github.com/cruzor-blade/planisfy.git
cd planisfy

# Start all services
docker compose up -d

# Access dashboard at http://localhost:3001
```

### Option C: Development

```bash
# Install dependencies
pnpm install

# Start all apps
pnpm dev

# Run tests
pnpm test
```

---

## Tech Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Monorepo** | Turborepo + pnpm | Fast builds, shared packages |
| **API Gateway** | Fastify (Node.js) | Performance, TypeScript-first |
| **Tiles** | Martin (Rust) | Speed, PMTiles support |
| **Geocoding** | Pelias (Node.js) | OpenStreetMap focus |
| **Routing** | Valhalla (C++) | Multi-modal profiles |
| **Data Source** | Overture Maps | Free, open, regularly updated |
| **Database** | PostgreSQL + Drizzle ORM | Type-safe, migrations |
| **Auth** | better-auth | Framework-agnostic, API keys built-in |
| **Dashboard** | Next.js 14 | App Router, Server Components |
| **Tile Delivery** | Cloudflare Workers + R2 | Edge caching, zero egress fees |

---

## Project Structure

```
planisfy/
├── apps/
│   ├── api/                    # API gateway
│   ├── dashboard/              # User dashboard (with RBAC)
│   ├── documentation/          # Public docs (Docusaurus)
│   └── tile-worker/            # Edge tile delivery
│
├── packages/
│   ├── auth/                   # Authentication
│   ├── config/                 # Shared configs
│   ├── database/               # Database schema
│   ├── map-styles/             # Map style definitions
│   ├── types/                  # Shared TypeScript types
│   └── utils/                  # Utilities
│
└── infrastructure/             # Docker, K8s configs
```

---

## Authentication Modes

Planisfy supports three deployment modes:

### SaaS Mode (Default)
- We host everything
- API keys managed by Planisfy
- Usage tracking and analytics

### Self-Hosted (Local Auth)
- You host the infrastructure
- You manage your own users/keys
- Use Planisfy for data updates only

### Hybrid (Remote Auth)
- You host engines (tiles, geocoding, routing)
- Use Planisfy SaaS for authentication
- Best for regulated industries

---

## Data Source

Planisfy uses **Overture Maps Foundation** data:

- Admins (boundaries), Buildings, Places
- Transportation (roads, railways, paths)
- Water, Land use/land cover
- Points of Interest

Updated monthly from Overture releases.

---

## Planned Features

- Optimization API (multi-stop routing)
- Matrix API (distance/time matrices)
- Navigation API (real-time turn notifications)
- Uploads API (custom datasets)
- Team management
- Regional deployments (EU, APAC data residency)
- Mobile SDKs

---

## Documentation

- **API Reference**: https://docs.planisfy.com/api
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **RBAC Design**: [docs/RBAC_ARCHITECTURE.md](./docs/RBAC_ARCHITECTURE.md)
- **Self-Hosting**: https://docs.planisfy.com/deployment/self-hosted

---

## Contributing

We welcome contributions! Areas we need help with:

- Map styles (dark, satellite, minimalist themes)
- Documentation improvements
- Bug fixes
- Localization
- Performance optimizations

---

## License

**GPL-3.0** - See [LICENSE](./LICENSE) for details.

---

## Acknowledgments

Built on amazing open-source projects:

- [Martin](https://github.com/maplibre/martin) - Vector tile server
- [Pelias](https://github.com/pelias/pelias) - Geocoding engine
- [Valhalla](https://github.com/valhalla/valhalla) - Routing engine
- [Overture Maps](https://overturemaps.org/) - Open map data
- [MapLibre GL JS](https://maplibre.org/) - Map rendering

---

**Status**: ✅ Production Ready | **Version**: 1.0.0
