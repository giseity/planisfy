import { Hono, type Context } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { env } from "../../env";
import { isPeliasConfigured } from "../setup/geocoding-config";

export const geocodingRoute = new Hono<AuthEnv>();

// ── GET /geocoding/v1/forward — Forward geocoding (address → coordinates) ───

geocodingRoute.get("/geocoding/v1/forward", async (c) => {
  const q = c.req.query("q");
  if (!q) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing 'q' parameter" } }, 400);
  }
  if (q.length > 500) {
    return c.json({ error: { code: "BAD_REQUEST", message: "'q' must be 500 characters or fewer" } }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit")) || 5, 25);
  const bbox = c.req.query("bbox");
  const lang = c.req.query("language") || "en";
  const countryCode = c.req.query("country");

  if (!isPeliasConfigured(env.PELIAS_URL)) {
    return geocoderNotConfigured(c);
  }

  try {
    const pelias = await requestPelias("search", {
      text: q,
      size: String(limit),
      lang,
      ...(bbox ? { "boundary.rect": bbox } : {}),
      ...(countryCode ? { "boundary.country": countryCode } : {}),
    });

    c.header("Cache-Control", "public, max-age=3600");
    return c.json(pelias);
  } catch (err) {
    console.error("[geocoding] Forward error:", err);
    return peliasError(c, err);
  }
});

// ── GET /geocoding/v1/reverse — Reverse geocoding (coordinates → address) ───

geocodingRoute.get("/geocoding/v1/reverse", async (c) => {
  const lon = Number(c.req.query("lon"));
  const lat = Number(c.req.query("lat"));

  if (isNaN(lon) || isNaN(lat)) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing or invalid 'lon' and 'lat' parameters" } }, 400);
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Coordinates out of range (lon: -180..180, lat: -90..90)" } }, 400);
  }

  const lang = c.req.query("language") || "en";
  const limit = Math.min(Number(c.req.query("limit")) || 1, 10);

  if (!isPeliasConfigured(env.PELIAS_URL)) {
    return geocoderNotConfigured(c);
  }

  try {
    const pelias = await requestPelias("reverse", {
      "point.lon": String(lon),
      "point.lat": String(lat),
      size: String(limit),
      lang,
    });

    c.header("Cache-Control", "public, max-age=3600");
    return c.json(pelias);
  } catch (err) {
    console.error("[geocoding] Reverse error:", err);
    return peliasError(c, err);
  }
});

// ── GET /geocoding/v1/autocomplete — Typeahead suggestions ──────────────────

geocodingRoute.get("/geocoding/v1/autocomplete", async (c) => {
  const text = c.req.query("text");
  if (!text) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Missing 'text' parameter" } }, 400);
  }
  if (text.length > 500) {
    return c.json({ error: { code: "BAD_REQUEST", message: "'text' must be 500 characters or fewer" } }, 400);
  }

  const limit = Math.min(Number(c.req.query("limit")) || 5, 10);
  const lang = c.req.query("language") || "en";
  const focusLon = c.req.query("focus.lon");
  const focusLat = c.req.query("focus.lat");

  if (!isPeliasConfigured(env.PELIAS_URL)) {
    return geocoderNotConfigured(c);
  }

  try {
    const pelias = await requestPelias("autocomplete", {
      text,
      size: String(limit),
      lang,
      ...(focusLon ? { "focus.point.lon": focusLon } : {}),
      ...(focusLat ? { "focus.point.lat": focusLat } : {}),
    });

    c.header("Cache-Control", "public, max-age=60");
    return c.json(pelias);
  } catch (err) {
    console.error("[geocoding] Autocomplete error:", err);
    return peliasError(c, err);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requestPelias(
  endpoint: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(`/v1/${endpoint}`, env.PELIAS_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new PeliasUpstreamError(res.status);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function geocoderNotConfigured(c: Context<AuthEnv>) {
  return c.json(
    {
      error: {
        code: "GEOCODER_NOT_CONFIGURED",
        message: "Configure PELIAS_URL with a Pelias-compatible geocoding service.",
      },
    },
    503,
  );
}

function peliasError(c: Context<AuthEnv>, err: unknown) {
  if (err instanceof PeliasUpstreamError) {
    return c.json(
      {
        error: {
          code: "UPSTREAM_ERROR",
          message: `Pelias geocoding service returned HTTP ${err.status}.`,
        },
      },
      502,
    );
  }

  return c.json(
    {
      error: {
        code: "GEOCODER_UNAVAILABLE",
        message: "Pelias geocoding service unavailable.",
      },
    },
    503,
  );
}

class PeliasUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Pelias returned HTTP ${status}`);
  }
}
