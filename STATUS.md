# Planisfy Status

Planisfy is currently in alpha. The repository has a working foundation, but several production paths still depend on external services, local data, or provider credentials.

## Working Foundation

- Monorepo workspace with API, console, admin, marketing, docs, and shared packages
- Hono API gateway with public map route groups
- better-auth session and organization setup
- API key generation, hashing, scopes, rate limits, quotas, and usage logging
- Drizzle schema for profiles, users, organizations, styles, API keys, sources, usage, and audit events
- Console style listing, creation, duplication, publishing, deletion, editor loading, and version history
- Docker Compose stack for app services, Postgres, Redis, Martin, and Valhalla

## External Requirements

- Martin needs configured PMTiles data under `infra/docker/data/pmtiles`
- Valhalla needs routing data under `infra/docker/data/valhalla_data`
- Production geocoding should use a Pelias-compatible service
- Production static map images require `STATIC_MAP_URL`
- Production email requires `RESEND_API_KEY`
- Billing requires `POLAR_ACCESS_TOKEN`
- S3/R2-style storage requires storage provider credentials

## Known Alpha Limitations

- Static maps return a placeholder SVG when no renderer is configured
- Geocoding falls back to Nominatim for basic development behavior
- Cloudflare tile worker/R2 delivery is not fully wired
- Test coverage is small and focused on core platform contracts
- Mobile SDKs, regional deployment, and managed SaaS paths are planned rather than complete
- A repository license file has not been added yet

## Verification Targets

Use these commands before merging:

```bash
pnpm check-types
pnpm lint
pnpm test
```

The Docker stack should build with:

```bash
docker compose -f infra/docker/docker-compose.yml build
```
