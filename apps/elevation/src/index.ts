import { serve } from "@hono/node-server";
import { loadWorkspaceEnv } from "@planisfy/env/node";
import { Hono } from "hono";
import { z } from "zod";
import { HgtTileSet, type ElevationPoint } from "./hgt";

loadWorkspaceEnv();

const port = Number(process.env.PORT ?? "8080");
const hostname = process.env.HOST ?? "0.0.0.0";
const demDir = process.env.ELEVATION_DEM_DIR ?? "/data/elevation";

const app = new Hono();
let tileSetPromise: Promise<HgtTileSet> | null = null;

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const lookupSchema = z.object({
  locations: z.array(locationSchema).min(1).max(500),
});

app.get("/health", async (c) => {
  const tileSet = await loadTiles();
  return c.json({
    ok: tileSet.count > 0,
    tiles: tileSet.count,
    demDir,
  }, tileSet.count > 0 ? 200 : 503);
});

app.post("/api/v1/lookup", async (c) => {
  const parsed = lookupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Expected { locations: [{ latitude, longitude }] }",
        },
      },
      400,
    );
  }

  const tileSet = await loadTiles();
  if (tileSet.count === 0) {
    return c.json(
      {
        error: {
          code: "NO_DEM_DATA",
          message: `No .hgt DEM tiles found in ${demDir}`,
        },
      },
      503,
    );
  }

  const results = parsed.data.locations.map((point) => samplePoint(tileSet, point));
  return c.json({
    results,
    attribution: "Elevation data sampled from local SRTM HGT tiles",
  });
});

function samplePoint(tileSet: HgtTileSet, point: ElevationPoint) {
  const sample = tileSet.sample(point);

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    elevation: sample?.elevation ?? null,
    source: sample?.source ?? null,
  };
}

function loadTiles() {
  tileSetPromise ??= HgtTileSet.load(demDir);
  return tileSetPromise;
}

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`Planisfy elevation service listening on ${hostname}:${info.port}`);
});
