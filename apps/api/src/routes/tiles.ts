import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const tilesRoute = new Hono<AuthEnv>();

// ── GET /tiles/v1/:source/:z/:x/:y — Vector/raster tile (proxy to Martin)──

tilesRoute.get("/tiles/v1/:source/:z/:x/:y", async (c) => {
  const { source, z, x, y } = c.req.param();

  try {
    const martinUrl = `${env.MARTIN_URL}/${source}/${z}/${x}/${y}`;
    const res = await fetch(martinUrl);

    if (!res.ok) {
      if (res.status === 404) {
        return c.json({ error: { code: "NOT_FOUND", message: "Tile not found" } }, 404);
      }
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Tile server error" } },
        502
      );
    }

    // Pass through the tile data with appropriate headers
    const body = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/x-protobuf";
    const encoding = res.headers.get("content-encoding");

    c.header("Content-Type", contentType);
    if (encoding) c.header("Content-Encoding", encoding);
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Access-Control-Allow-Origin", "*");

    return c.body(body);
  } catch (err) {
    console.error("[tiles] Proxy error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503
    );
  }
});

// ── GET /tiles/v1/:source.json — TileJSON metadata ─────────────────────────

tilesRoute.get("/tiles/v1/:source{.+\\.json$}", async (c) => {
  const source = c.req.param("source").replace(/\.json$/, "");

  try {
    const martinUrl = `${env.MARTIN_URL}/${source}`;
    const res = await fetch(martinUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return c.json({ error: { code: "NOT_FOUND", message: "Source not found" } }, 404);
    }

    const tileJson = await res.json();

    // Rewrite tile URLs to point through our API
    const baseUrl = new URL(c.req.url);
    const apiBase = `${baseUrl.protocol}//${baseUrl.host}`;
    if (tileJson.tiles) {
      tileJson.tiles = [`${apiBase}/tiles/v1/${source}/{z}/{x}/{y}`];
    }

    c.header("Cache-Control", "public, max-age=300");
    return c.json(tileJson);
  } catch {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503
    );
  }
});
