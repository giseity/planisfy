# Static Renderer

Hono service that renders MapLibre styles to PNG through Playwright/MapLibre and exposes `GET /render` plus `GET /health`.

Runs in Compose on container/local port `4300`; the API calls it through `STATIC_RENDERER_INTERNAL_URL`.

Important config: `PORT`, `HOST`, `PLANISFY_API_URL`,
`STATIC_RENDERER_MAX_REQUESTS` (default `128`),
`STATIC_RENDERER_MAX_RESOURCE_BYTES` (default `16777216`),
`STATIC_RENDERER_MAX_TOTAL_BYTES` (default `67108864`), and
`STATIC_RENDERER_REQUEST_TIMEOUT_MS` (default `10000`).

Style-controlled HTTP(S) resources are fetched through the shared DNS-pinned
outbound policy. Private and reserved destinations are denied. Only published
asset paths on `PLANISFY_API_URL` are treated as trusted internal requests.

Commands: `pnpm --filter static-renderer dev`, `check-types`, `lint`, `test`, `build`, `start`.
