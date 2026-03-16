import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

export const elevationRoute = new Hono<AuthEnv>();

// Open Elevation API (free, self-hostable) or OpenTopoData as fallback
const ELEVATION_URL = process.env.ELEVATION_URL || "https://api.open-elevation.com/api/v1";

interface ElevationResult {
  elevation: number;
}

interface ElevationResponse {
  results?: ElevationResult[];
}

interface ProfilePoint {
  distance: number;
  elevation: number;
  longitude: number;
  latitude: number;
}

// ── GET /elevation/v1/:coords — Point elevation ─────────────────────────────

elevationRoute.get("/elevation/v1/:coords", async (c) => {
  const coords = c.req.param("coords");
  const points = coords.split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { longitude: lon!, latitude: lat! };
  });

  if (points.length === 0 || points.some((p) => isNaN(p.latitude) || isNaN(p.longitude))) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Invalid coordinates. Format: lon,lat or lon1,lat1;lon2,lat2" } }, 400);
  }

  if (points.some((p) => p.longitude! < -180 || p.longitude! > 180 || p.latitude! < -90 || p.latitude! > 90)) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Coordinates out of range (lon: -180..180, lat: -90..90)" } }, 400);
  }

  if (points.length > 100) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Maximum 100 points per request" } }, 400);
  }

  try {
    const res = await fetch(`${ELEVATION_URL}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: points }),
    });

    if (!res.ok) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: "Elevation service error" } }, 502);
    }

    const data = (await res.json()) as ElevationResponse;

    const elevations = (data.results || []).map((r: ElevationResult, i: number) => ({
      longitude: points[i]!.longitude,
      latitude: points[i]!.latitude,
      elevation: r.elevation,
    }));

    c.header("Cache-Control", "public, max-age=86400");
    return c.json({
      elevations,
      attribution: "Elevation data from SRTM/ASTER via Open Elevation",
    });
  } catch (err) {
    console.error("[elevation] Lookup error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Elevation service unavailable" } }, 503);
  }
});

// ── GET /elevation/v1/along/:coords — Elevation profile along route ─────────

elevationRoute.get("/elevation/v1/along/:coords", async (c) => {
  const coords = c.req.param("coords");
  const points = coords.split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { longitude: lon!, latitude: lat! };
  });

  if (points.length < 2) {
    return c.json({ error: { code: "BAD_REQUEST", message: "At least 2 coordinates required for elevation profile" } }, 400);
  }

  // Interpolate points along the route for a smooth profile
  const numSamples = Math.min(Number(c.req.query("samples")) || 100, 500);
  const interpolated = interpolateAlongRoute(points, numSamples);

  try {
    const res = await fetch(`${ELEVATION_URL}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: interpolated }),
    });

    if (!res.ok) {
      return c.json({ error: { code: "UPSTREAM_ERROR", message: "Elevation service error" } }, 502);
    }

    const data = (await res.json()) as ElevationResponse;

    let cumulativeDistance = 0;
    const profile: ProfilePoint[] = (data.results || []).map((r: ElevationResult, i: number) => {
      if (i > 0) {
        cumulativeDistance += haversine(
          interpolated[i - 1]!.latitude, interpolated[i - 1]!.longitude,
          interpolated[i]!.latitude, interpolated[i]!.longitude
        );
      }
      return {
        distance: Math.round(cumulativeDistance),
        elevation: r.elevation,
        longitude: interpolated[i]!.longitude,
        latitude: interpolated[i]!.latitude,
      };
    });

    const elevations = profile.map((p) => p.elevation).filter((e) => e != null);
    const totalDistance = cumulativeDistance;
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    let totalAscent = 0;
    let totalDescent = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalAscent += diff;
      else totalDescent += Math.abs(diff);
    }

    c.header("Cache-Control", "public, max-age=86400");
    return c.json({
      profile,
      summary: {
        totalDistance: Math.round(totalDistance),
        minElevation: Math.round(minElevation),
        maxElevation: Math.round(maxElevation),
        totalAscent: Math.round(totalAscent),
        totalDescent: Math.round(totalDescent),
      },
      attribution: "Elevation data from SRTM/ASTER via Open Elevation",
    });
  } catch (err) {
    console.error("[elevation] Profile error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Elevation service unavailable" } }, 503);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function interpolateAlongRoute(
  points: { longitude: number; latitude: number }[],
  numSamples: number
): { longitude: number; latitude: number }[] {
  // Calculate total distance
  const segmentDistances: number[] = [];
  let totalDist = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
    segmentDistances.push(d);
    totalDist += d;
  }

  if (totalDist === 0) return points;

  const result: { longitude: number; latitude: number }[] = [];
  const step = totalDist / (numSamples - 1);

  for (let s = 0; s < numSamples; s++) {
    const targetDist = s * step;
    let accumulated = 0;

    for (let i = 0; i < segmentDistances.length; i++) {
      if (accumulated + segmentDistances[i] >= targetDist || i === segmentDistances.length - 1) {
        const ratio = segmentDistances[i] > 0 ? (targetDist - accumulated) / segmentDistances[i] : 0;
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        result.push({
          latitude: points[i].latitude + (points[i + 1].latitude - points[i].latitude) * clampedRatio,
          longitude: points[i].longitude + (points[i + 1].longitude - points[i].longitude) * clampedRatio,
        });
        break;
      }
      accumulated += segmentDistances[i];
    }
  }

  return result;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
