import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

const VALHALLA_URL = process.env.VALHALLA_URL || "http://localhost:3007";

export const directionsRoute = new Hono<AuthEnv>();

// ── Valhalla proxy helper ────────────────────────────────────────────────────

async function valhallaProxy(
  action: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${VALHALLA_URL}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`[valhalla] ${action} proxy error:`, err);
    return { ok: false, status: 503, data: { error: "Routing service unavailable" } };
  }
}

function parseCoords(coords: string): { lon: number; lat: number }[] {
  return coords.split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { lon, lat };
  });
}

function toValhallaLocations(coords: { lon: number; lat: number }[]) {
  return coords.map((c) => ({ lon: c.lon, lat: c.lat }));
}

// ── GET /directions/v1/:profile/:coords ─────────────────────────────────────

directionsRoute.get("/directions/v1/:profile/:coords", async (c) => {
  const { profile, coords } = c.req.param();
  const points = parseCoords(coords);

  if (points.length < 2) {
    return c.json({ error: { code: "BAD_REQUEST", message: "At least 2 coordinates required" } }, 400);
  }

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const alternates = Number(c.req.query("alternatives")) || 0;
  const units = c.req.query("units") || "kilometers";
  const language = c.req.query("language") || "en";

  const result = await valhallaProxy("route", {
    locations: toValhallaLocations(points),
    costing,
    units,
    language,
    alternates: Math.min(alternates, 3),
    directions_options: { units },
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  c.header("Cache-Control", "public, max-age=300");
  return c.json(result.data);
});

// ── POST /directions/v1/:profile — Accept body instead of URL coords ────────

directionsRoute.post("/directions/v1/:profile", async (c) => {
  const { profile } = c.req.param();
  const body = await c.req.json();

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const result = await valhallaProxy("route", {
    ...body,
    costing: body.costing || costing,
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  return c.json(result.data);
});

// ── GET /isochrone/v1/:profile/:coord ───────────────────────────────────────

directionsRoute.get("/isochrone/v1/:profile/:coord", async (c) => {
  const { profile, coord } = c.req.param();
  const [lon, lat] = coord.split(",").map(Number);

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const contours: { time?: number; distance?: number }[] = [];
  const timeParam = c.req.query("contours_minutes");
  const distParam = c.req.query("contours_meters");

  if (timeParam) {
    for (const t of timeParam.split(",")) contours.push({ time: Number(t) });
  } else if (distParam) {
    for (const d of distParam.split(",")) contours.push({ distance: Number(d) / 1000 });
  } else {
    contours.push({ time: 15 });
  }

  const polygons = c.req.query("polygons") !== "false";

  const result = await valhallaProxy("isochrone", {
    locations: [{ lon, lat }],
    costing,
    contours,
    polygons,
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  c.header("Cache-Control", "public, max-age=300");
  return c.json(result.data);
});

// ── GET /matching/v1/:profile/:coords — Map matching (trace_route) ──────────

directionsRoute.get("/matching/v1/:profile/:coords", async (c) => {
  const { profile, coords } = c.req.param();
  const points = parseCoords(coords);

  if (points.length < 2) {
    return c.json({ error: { code: "BAD_REQUEST", message: "At least 2 coordinates required" } }, 400);
  }

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const result = await valhallaProxy("trace_route", {
    shape: points.map((p) => ({ lon: p.lon, lat: p.lat })),
    costing,
    shape_match: "map_snap",
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  return c.json(result.data);
});

// ── GET /matrix/v1/:profile/:coords — Distance/duration matrix ──────────────

directionsRoute.get("/matrix/v1/:profile/:coords", async (c) => {
  const { profile, coords } = c.req.param();
  const points = parseCoords(coords);

  if (points.length < 2) {
    return c.json({ error: { code: "BAD_REQUEST", message: "At least 2 coordinates required" } }, 400);
  }

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const sourcesParam = c.req.query("sources");
  const destinationsParam = c.req.query("destinations");

  const sources = sourcesParam
    ? sourcesParam.split(";").map((i) => points[Number(i)])
    : points;
  const targets = destinationsParam
    ? destinationsParam.split(";").map((i) => points[Number(i)])
    : points;

  const result = await valhallaProxy("sources_to_targets", {
    sources: toValhallaLocations(sources),
    targets: toValhallaLocations(targets),
    costing,
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  return c.json(result.data);
});

// ── GET /optimized-trips/v1/:profile/:coords — TSP ──────────────────────────

directionsRoute.get("/optimized-trips/v1/:profile/:coords", async (c) => {
  const { profile, coords } = c.req.param();
  const points = parseCoords(coords);

  if (points.length < 3) {
    return c.json({ error: { code: "BAD_REQUEST", message: "At least 3 coordinates required for optimization" } }, 400);
  }

  const costing = mapProfileToCosting(profile);
  if (!costing) {
    return c.json({ error: { code: "BAD_REQUEST", message: `Unknown profile: ${profile}` } }, 400);
  }

  const result = await valhallaProxy("optimized_route", {
    locations: toValhallaLocations(points),
    costing,
  });

  if (!result.ok) {
    return c.json({ error: result.data }, result.status as any);
  }

  return c.json(result.data);
});

// ── Profile mapping ──────────────────────────────────────────────────────────

function mapProfileToCosting(profile: string): string | null {
  const map: Record<string, string> = {
    driving: "auto",
    "driving-traffic": "auto",
    car: "auto",
    auto: "auto",
    walking: "pedestrian",
    pedestrian: "pedestrian",
    cycling: "bicycle",
    bicycle: "bicycle",
    bike: "bicycle",
    truck: "truck",
    bus: "bus",
    motor_scooter: "motor_scooter",
    motorcycle: "motorcycle",
  };
  return map[profile] ?? null;
}
