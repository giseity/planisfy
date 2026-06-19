import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { env } from "../../env";

export const fontsRoute = new Hono<AuthEnv>();

// Glyphs URL pattern used by MapLibre:
// /fonts/v1/{fontstack}/{range}.pbf
//
// Glyphs are served by the configured local glyph service. Martin's font
// endpoint expects ranges without the MapLibre ".pbf" suffix, so normalize it.

const GLYPHS_BASE_URL = env.GLYPHS_URL;

fontsRoute.get("/fonts/v1/:fontstack/:range", async (c) => {
  const { fontstack, range } = c.req.param();
  const glyphRange = normalizeGlyphRange(range);
  const upstreamUrl = glyphRange
    ? buildGlyphUrl(GLYPHS_BASE_URL, fontstack, glyphRange)
    : null;

  if (!upstreamUrl) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid font range" } },
      400,
    );
  }

  try {
    const res = await fetch(upstreamUrl, { redirect: "manual" });

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

export function normalizeGlyphRange(range: string) {
  const match = range.match(/^(\d+)-(\d+)(?:\.pbf)?$/);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start
  ) {
    return null;
  }

  return `${start}-${end}`;
}

export function buildGlyphUrl(
  baseUrl: string,
  fontstack: string,
  glyphRange: string,
) {
  if (!isSafeFontstack(fontstack)) return null;
  return new URL(
    `${encodeURIComponent(fontstack)}/${encodeURIComponent(glyphRange)}`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

function isSafeFontstack(fontstack: string) {
  if (fontstack.length === 0 || fontstack.length > 256) return false;
  if (fontstack.includes("/") || fontstack.includes("\\")) return false;
  if (/[?#]/.test(fontstack)) return false;
  return fontstack
    .split(",")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
