# Planisfy

> A self-hosted, scalable Mapbox-compatible API platform built with Turborepo.

**Planisfy** provides drop-in Mapbox API compatibility using open-source geospatial engines. Host it yourself for full data sovereignty, or use our managed SaaS.

---

## What is Planisfy?

Planisfy is a Mapbox alternative that:

- **Mapbox API Compatible** - Switch by changing one URL
- **Self-Hostable** - Run on your own infrastructure
- **Open Source Core** - Built on Martin, Valhalla, Overture Maps
- **Full Featured** - Tiles, geocoding, routing, styles, dashboard

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Martin    │      │  Geocoding  │      │  Valhalla   │
│  (Tiles)    │      │ (external)  │      │  (Routing)   │
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

### Planned Core APIs

| API | Description | Engine |
|-----|-------------|--------|
| **Vector Tiles** | Protocol Buffer vector tiles | Martin |
| **Style JSON** | MapLibre style specifications | Static |
| **Sprites & Glyphs** | Map icons and text rendering | R2 |
| **Geocoding** | Forward/reverse address search | Separate project (Pelias) |
| **Directions** | Turn-by-turn routing | Valhalla |

### Planned Platform Features

| Feature | Description |
|---------|-------------|
| **API Key Authentication** | Bearer token or query param |
| **Rate Limiting** | Per-key RPM limits |
| **Usage Analytics** | Request tracking, charts |
| **Role-Based Access** | User/Admin roles |
| **User Dashboard** | API key management, usage views |

### Future Features

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

# Start all services with Docker
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Access dashboard at http://localhost:3002
# Access docs at http://localhost:3001
# API runs on http://localhost:3003
```
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

## Current Status

**Phase: Architecture & Foundation** 🏗️

This project is in active development. We're building the core infrastructure.

See [STATUS.md](./STATUS.md) for detailed implementation status.

---

## Tech Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Monorepo** | Turborepo + pnpm | Fast builds, shared packages |
| **API Gateway** | Fastify (Node.js) | Performance, TypeScript-first |
| **Tiles** | Martin (Rust) | Speed, PMTiles support |
| **Geocoding** | Separate project (Pelias) | OpenStreetMap focus |
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
│   ├── api/                    # API gateway (Fastify)
│   ├── dashboard/              # User dashboard (Next.js, RBAC)
│   ├── docs/                   # Documentation (Fumadocs)
│   ├── web/                    # Landing/marketing site
│   └── tile-worker/            # Edge tile delivery (Cloudflare)
│
├── packages/
│   ├── auth/                   # Authentication (@planisfy/auth)
│   ├── database/               # Database schema (@planisfy/database)
│   ├── types/                  # Shared TypeScript types (@planisfy/types)
│   ├── utils/                  # Utilities (@planisfy/utils)
│   ├── map-styles/             # Map style definitions (@planisfy/map-styles)
│   ├── ui/                     # Shared UI components (@planisfy/ui)
│   ├── eslint-config/          # ESLint configuration (@planisfy/eslint-config)
│   ├── typescript-config/      # TypeScript config (@planisfy/typescript-config)
│   └── prettier-config/        # Prettier config (@planisfy/prettier-config)
│
├── infrastructure/
│   └── docker/
│       ├── docker-compose.yml  # All services orchestration
│       ├── martin-config.yaml  # Tile server config
│       └── valhalla-config.json # Routing config
│
├── STATUS.md                   # Implementation status tracking
└── ARCHITECTURE.md             # System architecture documentation
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
- You host engines (tiles, routing) and the geocoding project
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

After core infrastructure is complete:

- Optimization API (multi-stop routing)
- Matrix API (distance/time matrices)
- Navigation API (real-time turn notifications)
- Uploads API (custom datasets)
- Team management
- Regional deployments (EU, APAC data residency)
- Mobile SDKs

---

## Documentation

- **Implementation Status**: [STATUS.md](./STATUS.md) - Track our progress
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- **RBAC Design**: [docs/RBAC_ARCHITECTURE.md](./docs/RBAC_ARCHITECTURE.md) - Access control
- **App READMEs**: See individual `apps/*/README.md` for details

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

## Contributing

We welcome contributions! Areas we need help with:

- Map styles (dark, satellite, minimalist themes)
- Documentation improvements
- Bug fixes
- Localization
- Performance optimizations

**See [STATUS.md](./STATUS.md) for current priorities.**

---

## Acknowledgments

Built on amazing open-source projects:

- [Martin](https://github.com/maplibre/martin) - Vector tile server
- [Valhalla](https://github.com/valhalla/valhalla) - Routing engine
- [Overture Maps](https://overturemaps.org/) - Open map data
- [MapLibre GL JS](https://maplibre.org/) - Map rendering

---

**Status**: 🏗️ In Development | **Version**: 0.1.0-alpha
