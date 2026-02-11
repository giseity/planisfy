# Planisfy Tile Worker

Cloudflare Worker for edge-optimized vector tile delivery from PMTiles stored on R2.

---

## Overview

Serves vector tiles from Cloudflare R2 with:
- **Edge Caching** - 300+ locations worldwide
- **Zero Egress Cost** - R2 has no bandwidth fees
- **Sub-50ms Latency** - Workers execute at the edge
- **Automatic Scaling** - No server management

---

## Architecture

```
User Request → Cloudflare Edge
    ├─ Cache Hit → Return (~10ms)
    └─ Cache Miss → Fetch from R2
                  → Cache 7 days
                  → Return
```

---

## How It Works

1. Tile Request: `GET /tiles/v1/{style}/{z}/{x}/{y}{@2x}`
2. API Key Validation
3. Fetch from R2 PMTiles
4. Cache for 7 days
5. Return binary tile data

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Cloudflare Workers |
| **Storage** | Cloudflare R2 |
| **Format** | PMTiles |
| **Parsing** | pmtiles JS |

---

## Development

```bash
pnpm install
pnpm dev              # Local testing with Miniflare
npx wrangler deploy   # Deploy to Cloudflare
npx wrangler tail     # View logs
```

---

## Configuration

**`wrangler.toml`**:
```toml
name = "planisfy-tile-worker"
main = "src/worker.ts"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "planisfy-tiles"
```

---

## Performance

| Metric | Target |
|--------|--------|
| Cold Start | <100ms |
| Cache Hit | <20ms |
| Cache Miss | <150ms |
| Hit Rate | >90% |

---

## Deployment

```bash
npx wrangler deploy
```

---

## Planned Features

- API key validation
- Per-key rate limiting
- Tile metrics
