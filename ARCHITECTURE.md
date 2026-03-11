# Planisfy Architecture

## Overview

Planisfy is a distributed geospatial API platform that provides Mapbox-compatible endpoints. This document outlines the system architecture, component responsibilities, and key design decisions.

---

## System Architecture

```
                    ┌─────────────────────────────────────┐
                    │          Client Applications        │
                    │    (MapLibre GL JS, Mobile Apps)    │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │       Cloudflare Edge Network       │
                    │  ┌──────────────────────────────┐  │
                    │  │      Tile Worker (R2→CDN)    │  │
                    │  └──────────────────────────────┘  │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │         API Gateway (Fastify)        │
                    │  ┌──────────────────────────────┐  │
                    │  │  Auth & Rate Limiting       │  │
                    │  │  Request Routing             │  │
                    │  │  Usage Tracking              │  │
                    │  └──────────────────────────────┘  │
                    └─────┬──────────┬──────────┬─────────┘
                          │          │          │
            ┌─────────────▼────┐ ┌───▼──────┐ ┌▼────────────┐
            │                  │ │          │ │             │
      ┌─────▼─────┐     ┌─────▼───▼──┐   ┌──▼──────┐  ┌──▼─────────┐
      │  Martin   │     │ Geocoding  │   │Valhalla │  │PostgreSQL  │
      │ (Rust)    │     │ (external) │   │ (C++)   │  │  + Redis   │
      │  Tiles    │     │            │   │Routing  │  │            │
      └───────────┘     └────────────┘   └─────────┘  └────────────┘
            │                  │                │
            └──────────────────┴────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Overture Maps     │
                    │   (PMTiles)         │
                    └─────────────────────┘
```

---

## Component Responsibilities

### Client Layer

| Component | Purpose |
|-----------|---------|
| **MapLibre GL JS** | Renders vector tiles in browser |
| **Mobile SDKs** | Native iOS/Android map rendering (planned) |

### Edge Layer

| Component | Purpose |
|-----------|---------|
| **Tile Worker (Cloudflare)** | Serves tiles from R2 with edge caching |
| **R2 Storage** | Stores PMTiles, zero egress fees |
| **CDN** | 300+ edge locations worldwide |

### API Gateway

| Component | Purpose |
|-----------|---------|
| **Fastify** | High-performance HTTP server |
| **Auth Middleware** | API key validation, JWT sessions |
| **Rate Limiter** | Per-key request throttling |
| **Usage Tracker** | Request logging, metrics collection |

### Backend Engines

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Martin** | Rust | Serves vector tiles from PMTiles |
| **Geocoding** | External service | Geocoding and reverse search (separate project) |
| **Valhalla** | C++ | Turn-by-turn routing |

### Data Layer

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | User accounts, API keys, usage logs |
| **Redis** | Rate limiting, caching |
| **PMTiles** | Overture Maps data storage |

---

## Request Flow

### Tile Request

```
1. Client: GET /tiles/v1/planisfy.basic/14/4823/6140
2. Cloudflare Edge: Check cache
   ├─ HIT: Return tile immediately (~10ms)
   └─ MISS: Forward to Tile Worker
3. Tile Worker: Fetch from R2 PMTiles
4. Cloudflare: Cache for 7 days
5. Client: Render tile
```

### Geocoding Request

```
1. Client: GET /geocoding/v1/planisfy/places.json?q=Paris
2. API Gateway: Validate API key, check rate limit
3. Geocoding service: Search Overture index
4. API Gateway: Format response, log usage
5. Client: Display results
```

### Dashboard Request

```
1. Browser: GET /dashboard/api-keys
2. Next.js Middleware: Check session
3. Dashboard: Fetch from PostgreSQL
4. Render: Server Component → HTML
```

---

## Key Architectural Decisions

### 1. PMTiles over MBTiles

**Decision**: Use PMTiles for tile storage

**Why**:
- Single file per tileset (vs thousands of files)
- Cloud-native (S3, R2 compatible)
- Random access via HTTP range requests
- Better compression

### 2. Cloudflare Workers + R2 for Tiles

**Decision**: Serve tiles from edge with R2 backend

**Why**:
- Zero egress fees (vs AWS S3)
- 300+ edge locations (low latency)
- Automatic caching
- No server management

### 3. Single Dashboard with RBAC

**Decision**: One dashboard with role-based UI rendering

**Why**:
- Simpler deployment (self-hosters run one app)
- Seamless user experience
- Shared components
- Easier maintenance

### 4. better-auth over NextAuth.js

**Decision**: Use better-auth for authentication

**Why**:
- Framework-agnostic (works with Fastify + Next.js)
- Built-in API key generation
- TypeScript-first
- Simpler integration

### 5. Drizzle ORM over Prisma

**Decision**: Use Drizzle ORM

**Why**:
- Smaller bundle size (~50KB vs ~500KB)
- SQL-like queries (familiar syntax)
- Better performance
- Full migration control

### 6. Turborepo for Monorepo

**Decision**: Use Turborepo + pnpm

**Why**:
- Fast incremental builds
- Shared packages (types, utils, auth)
- Parallel task execution
- Better caching than Nx/Lerna

### 7. Console Uses Server Actions, API Gateway for External Access

**Decision**: The console app (Next.js) accesses the database directly via server actions and server components. The Fastify API gateway is exclusively for external SDK/API-key access.

**Why**:
- Avoids unnecessary network hop for dashboard operations
- Server actions provide type-safe, colocated data fetching
- Single source of truth for external API validation and rate limiting
- Simpler architecture for a small team

---

## Data Flow Diagrams

### Authentication Flow

```
┌──────────┐                 ┌──────────────┐
│  User    │                 │   Database   │
└─────┬────┘                 └──────┬───────┘
      │                              │
      │ 1. POST /login               │
      ├─────────────────────────────>│
      │                              │ 2. Verify credentials
      │                              │
      │ 3. Return session token      │
      │<─────────────────────────────│
      │                              │
      │ 4. Request with token        │
      ├─────────────────────────────>│
      │ 5. Validate token, return data│
      │<─────────────────────────────│
```

### API Request Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────┐
│  Client  │────>│ API Gateway │────>│  Engine  │
└──────────┘     └─────────────┘     └──────────┘
                      │
                      ▼
                ┌──────────┐
                │ Database │ (Log usage)
                └──────────┘
```

---

## Deployment Architecture

### Self-Hosted (Docker)

```
┌──────────────────────────────────────┐
│         Docker Host / Server         │
│                                      │
│  ┌────────┐             ┌────────┐ │
│  │ API    │             │Valhalla│ │
│  │Gateway │             │        │ │
│  └────┬───┘             └────────┘ │
│       │                            │
│  ┌────▼─────┐  ┌─────────────────┐ │
│  │PostgreSQL│  │    Redis        │ │
│  └──────────┘  └─────────────────┘ │
└──────────────────────────────────────┘
```

### Cloudflare Hybrid

```
┌──────────────────┐      ┌─────────────────┐
│ Cloudflare Edge  │      │  VPS / Origin   │
│                   │      │                 │
│  Tile Worker     │<────>│  API Gateway    │
│  (Tiles only)    │      │  Valhalla, DB   │
│                  │      │                 │
└──────────────────┘      └─────────────────┘
```

---

## Security Architecture

### Authentication Layers

1. **API Keys** (for external API access)
   - Bearer token or query parameter
   - Stored as bcrypt hash in database
   - Scopes limit access to specific endpoints

2. **Sessions** (for dashboard)
   - JWT-based session tokens
   - HTTP-only cookies
   - Role-based access control

### Rate Limiting

- **Per-key limits**: Redis-backed sliding window
- **Global limits**: Protect infrastructure
- **Tier-based**: Different limits per user role

### Data Isolation

- **User data**: Each user sees only their own data
- **Admin override**: Admins can view all users
- **API key scoping**: Keys limited to specific APIs

---

## Scalability

### Horizontal Scaling

| Component | Scaling Strategy |
|-----------|-----------------|
| **API Gateway** | Stateless, add instances behind load balancer |
| **Tile Worker** | Auto-scales with Cloudflare |
| **Geocoding** | Scaled independently (separate project) |
| **Valhalla** | Per-region deployments |
| **Database** | Read replicas, partitioning |

### Performance Targets

| Metric | Target |
|--------|--------|
| Tile latency (cache hit) | <50ms |
| Tile latency (cache miss) | <200ms |
| Geocoding latency | <500ms |
| Routing latency | <1000ms |
| API Gateway P95 | <100ms |

---

## Monitoring & Observability

### Metrics Collected

- Request count per endpoint
- Response times (P50, P95, P99)
- Error rates (4xx, 5xx)
- Cache hit rates
- Rate limit violations
- Engine health status

### Logging Strategy

- **API Gateway**: Structured JSON logs
- **Usage tracking**: Async写入 database
- **Errors**: Centralized logging (Loki/ELK)
- **Audit logs**: Admin actions

---

## Technology Rationale

### Why Rust for Martin?
- Performance: 10x faster than Node.js tile servers
- Memory safety: No memory leaks
- Concurrency: Handle thousands of concurrent requests

### Why C++ for Valhalla?
- Performance: Routing algorithms are CPU-intensive
- Maturity: Battle-tested by large mapping companies
- Features: Multi-modal routing (car, bike, walk, transit)

### Why PostgreSQL?
- Relational data: Users, API keys, sessions
- Transactions: ACID guarantees
- JSONB: Flexible schema for logs
- Partitioning: Efficient usage log storage

---

## Future Architecture Considerations

### Regional Deployment

- Deploy engines closer to users
- Data residency compliance (EU, APAC)
- Reduce latency for routing/geocoding

### Microservices Evolution

- Extract tile serving completely
- Separate billing service
- Independent service scaling

### Caching Strategy

- Edge cache (Cloudflare) - 7 days
- Application cache (Redis) - 1 hour
- Database cache (PostgreSQL) - 5 minutes

---

## Documentation

- **RBAC Design**: [docs/RBAC_ARCHITECTURE.md](./docs/RBAC_ARCHITECTURE.md)
- **Package READMEs**: See individual packages/ directories
- **App READMEs**: See individual apps/ directories

---

**Last Updated**: Architecture is evolving. Implementation details may vary.
