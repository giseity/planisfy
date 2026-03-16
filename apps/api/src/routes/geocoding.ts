import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

const PELIAS_URL = process.env.PELIAS_URL || "http://localhost:4000/geocoding";
// If Pelias is not available, we'll use Nominatim as a fallback for basic geocoding
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

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

  try {
    // Try Pelias first
    const pelias = await tryPelias("search", {
      text: q,
      size: String(limit),
      lang,
      ...(bbox ? { "boundary.rect": bbox } : {}),
      ...(countryCode ? { "boundary.country": countryCode } : {}),
    });

    if (pelias) {
      c.header("Cache-Control", "public, max-age=3600");
      return c.json(pelias);
    }

    // Fallback to Nominatim
    const params = new URLSearchParams({
      q,
      format: "geojson",
      limit: String(limit),
      "accept-language": lang,
      addressdetails: "1",
    });
    if (countryCode) params.set("countrycodes", countryCode);
    if (bbox) {
      const [minLon, minLat, maxLon, maxLat] = bbox.split(",");
      params.set("viewbox", `${minLon},${minLat},${maxLon},${maxLat}`);
      params.set("bounded", "1");
    }

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { "User-Agent": "Planisfy/1.0 (https://planisfy.com)" },
    });

    if (!res.ok) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: "Geocoding service error" } }, 502);
    }

    const data = await res.json();
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(normalizeGeocodingResult(data));
  } catch (err) {
    console.error("[geocoding] Forward error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Geocoding service unavailable" } }, 503);
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

  try {
    // Try Pelias first
    const pelias = await tryPelias("reverse", {
      "point.lon": String(lon),
      "point.lat": String(lat),
      size: String(limit),
      lang,
    });

    if (pelias) {
      c.header("Cache-Control", "public, max-age=3600");
      return c.json(pelias);
    }

    // Fallback to Nominatim
    const params = new URLSearchParams({
      lon: String(lon),
      lat: String(lat),
      format: "geojson",
      "accept-language": lang,
      addressdetails: "1",
      zoom: "18",
    });

    const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, {
      headers: { "User-Agent": "Planisfy/1.0 (https://planisfy.com)" },
    });

    if (!res.ok) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: "Geocoding service error" } }, 502);
    }

    const data = await res.json();
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(normalizeGeocodingResult(data));
  } catch (err) {
    console.error("[geocoding] Reverse error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Geocoding service unavailable" } }, 503);
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

  try {
    const pelias = await tryPelias("autocomplete", {
      text,
      size: String(limit),
      lang,
      ...(focusLon ? { "focus.point.lon": focusLon } : {}),
      ...(focusLat ? { "focus.point.lat": focusLat } : {}),
    });

    if (pelias) {
      c.header("Cache-Control", "public, max-age=60");
      return c.json(pelias);
    }

    // Nominatim doesn't have autocomplete, use search with small limit
    const params = new URLSearchParams({
      q: text,
      format: "geojson",
      limit: String(limit),
      "accept-language": lang,
      addressdetails: "1",
    });

    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { "User-Agent": "Planisfy/1.0 (https://planisfy.com)" },
    });

    if (!res.ok) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: "Geocoding service error" } }, 502);
    }

    const data = await res.json();
    c.header("Cache-Control", "public, max-age=60");
    return c.json(normalizeGeocodingResult(data));
  } catch (err) {
    console.error("[geocoding] Autocomplete error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Geocoding service unavailable" } }, 503);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function tryPelias(
  endpoint: string,
  params: Record<string, string>
): Promise<unknown | null> {
  try {
    const url = new URL(`/v1/${endpoint}`, PELIAS_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}

interface NominatimFeature {
  geometry: unknown;
  properties?: {
    display_name?: string;
    label?: string;
    name?: string;
    importance?: number;
    address?: {
      house_number?: string;
      road?: string;
      postcode?: string;
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      country?: string;
      country_code?: string;
    };
  };
}

interface NominatimResponse {
  features?: NominatimFeature[];
}

function normalizeGeocodingResult(geojson: NominatimResponse | NominatimFeature) {
  const features = "features" in geojson && geojson.features
    ? geojson.features
    : [geojson as NominatimFeature];

  return {
    type: "FeatureCollection",
    features: features.filter(Boolean).map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        label: f.properties?.display_name || f.properties?.label || "",
        name: f.properties?.name || f.properties?.display_name?.split(",")[0] || "",
        housenumber: f.properties?.address?.house_number,
        street: f.properties?.address?.road,
        postalcode: f.properties?.address?.postcode,
        city: f.properties?.address?.city || f.properties?.address?.town || f.properties?.address?.village,
        state: f.properties?.address?.state,
        country: f.properties?.address?.country,
        country_code: f.properties?.address?.country_code,
        confidence: f.properties?.importance ? Math.round(f.properties.importance * 10) / 10 : undefined,
        source: "nominatim",
      },
    })),
    attribution: "Data © OpenStreetMap contributors, ODbL 1.0",
  };
}
