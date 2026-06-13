import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const fontsRoute = new Hono<AuthEnv>();

// Glyphs URL pattern used by MapLibre:
// /fonts/v1/{fontstack}/{range}.pbf
//
// Glyphs are served by the configured local glyph service. Martin's font
// endpoint expects ranges without the MapLibre ".pbf" suffix, so normalize it.

const GLYPHS_BASE_URL = env.GLYPHS_URL;

fontsRoute.get("/fonts/v1/:fontstack/:range", async (c) => {
  const { fontstack, range } = c.req.param();
  const glyphRange = range.replace(/\.pbf$/, "");

  try {
    const url = `${GLYPHS_BASE_URL}/${encodeURIComponent(fontstack)}/${glyphRange}`;
    const res = await fetch(url);

    if (!res.ok) {
      return c.json({ error: { code: "NOT_FOUND", message: "Font range not found" } }, 404);
    }

    const body = await res.arrayBuffer();
    c.header("Content-Type", "application/x-protobuf");
    c.header("Cache-Control", "public, max-age=86400"); // 24h
    c.header("Access-Control-Allow-Origin", "*");

    return c.body(body);
  } catch {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Font server unavailable" } },
      503
    );
  }
});
