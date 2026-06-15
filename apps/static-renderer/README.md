# Static Renderer

Hono service that renders MapLibre styles to PNG through Playwright/MapLibre and exposes `GET /render` plus `GET /health`.

Runs in Compose on container/local port `4300`; the API calls it through `STATIC_MAP_URL`.

Important config: `PORT`, `HOST`, `PLANISFY_API_URL`.

Commands: `pnpm --filter static-renderer dev`, `check-types`, `lint`, `test`, `build`, `start`.
