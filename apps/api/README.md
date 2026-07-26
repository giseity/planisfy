# API App

Hono API gateway for auth, public map APIs, console APIs, internal routes, health, metrics, and setup preflight.

Runs on port `4000` locally and in Compose. It needs PostgreSQL, Redis, storage configuration, and configured geospatial services for full map behavior.

Important config: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`, `MARTIN_INTERNAL_URL`, `VALHALLA_INTERNAL_URL`, `PELIAS_INTERNAL_URL`, `GLYPHS_INTERNAL_URL`, `ELEVATION_INTERNAL_URL`, `STATIC_RENDERER_INTERNAL_URL`, storage provider variables, Dodo, and ZeptoMail.

Commands: `pnpm --filter api dev`, `check-types`, `lint`, `test`, `build`, `start`.
