import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { env } from "../../env";

export const staticMapRoute = new Hono<AuthEnv>();

// Static map image generation is delegated to a configured renderer service.

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

  if (STATIC_BASE_URL) {
    try {
      const url = `${STATIC_BASE_URL}/render?` +
        `owner=${encodeURIComponent(owner)}` +
        `&style=${encodeURIComponent(style)}` +
        `&center=${lon},${lat}` +
        `&zoom=${zoom}` +
        `&width=${width}` +
        `&height=${height}`;

      const headers = forwardedRenderHeaders(c.req.raw.headers);
      const res = await fetch(url, { headers });

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

  return c.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Static map rendering is not configured",
      },
    },
    501,
  );
});

function forwardedRenderHeaders(headers: Headers) {
  const forwarded: Record<string, string> = {};

  for (const name of ["x-api-key", "authorization", "cookie"]) {
    const value = headers.get(name);
    if (value) forwarded[name] = value;
  }

  return forwarded;
}
