import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const staticMapRoute = new Hono<AuthEnv>();

// Static map image generation
// In production, use @maplibre/maplibre-gl-native or a headless browser
// For now, proxy to a simple tile composite service

const STATIC_BASE_URL = env.STATIC_MAP_URL;

// ── GET /static/v1/:owner/:style/:lon,:lat,:zoom/:widthx:height.png ─────────

staticMapRoute.get("/static/v1/:owner/:style/:center/:size{.+\\.png$}", async (c) => {
  const { owner, style, center, size } = c.req.param();

  // Parse center: lon,lat,zoom
  const centerParts = center.split(",");
  if (centerParts.length < 3) {
    return c.json({
      error: { code: "BAD_REQUEST", message: "Center format: lon,lat,zoom" },
    }, 400);
  }

  const lon = Number(centerParts[0]);
  const lat = Number(centerParts[1]);
  const zoom = Number(centerParts[2]);

  if (isNaN(lon) || isNaN(lat) || isNaN(zoom)) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Invalid center coordinates" } }, 400);
  }

  // Parse size: widthxheight.png
  const sizeStr = size.replace(/\.png$/, "");
  const [widthStr, heightStr] = sizeStr.split("x");
  const width = Number(widthStr);
  const height = Number(heightStr);

  if (isNaN(width) || isNaN(height) || width < 1 || height < 1) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Size format: widthxheight (e.g. 800x600)" } }, 400);
  }

  if (width > 2048 || height > 2048) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Maximum dimensions: 2048x2048" } }, 400);
  }

  // If a static map service is configured, proxy to it
  if (STATIC_BASE_URL) {
    try {
      const url = `${STATIC_BASE_URL}/render?` +
        `owner=${encodeURIComponent(owner)}` +
        `&style=${encodeURIComponent(style)}` +
        `&center=${lon},${lat}` +
        `&zoom=${zoom}` +
        `&width=${width}` +
        `&height=${height}`;

      const res = await fetch(url);

      if (!res.ok) {
        return c.json({ error: { code: "UPSTREAM_ERROR", message: "Static map render failed" } }, 502);
      }

      const body = await res.arrayBuffer();
      c.header("Content-Type", "image/png");
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(body);
    } catch (err) {
      console.error("[static] Render error:", err);
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Static map service unavailable" } }, 503);
    }
  }

  // No static map service configured — generate a placeholder or return 501
  // Generate a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#e5e7eb"/>
    <text x="50%" y="45%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#6b7280">Static Map</text>
    <text x="50%" y="55%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#9ca3af">${owner}/${style} @ ${lon.toFixed(4)},${lat.toFixed(4)} z${zoom}</text>
    <text x="50%" y="65%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#9ca3af">${width}×${height}</text>
  </svg>`;

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=60");
  return c.body(svg);
});
