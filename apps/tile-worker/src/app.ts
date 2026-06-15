import {
  parsePublicTilesetSlug,
  parseTileCoordinates,
  parseTileQueryCoordinates,
  parseTileQueryOptions,
  queryResolvedTileset,
  readResolvedTile,
  resolveTileset,
  type GeoJsonFeatureCollection,
  type ResolvedTileset,
  type TileCoordinates,
  type TileQueryOptions,
  type TileQueryResult,
  type TileReadResult,
  type TileRuntimeError,
} from "@planisfy/tile-runtime";
import { Hono, type Context } from "hono";
import { env } from "./env";

type TileWorkerDeps = {
  resolveTileset: typeof resolveTileset;
  readResolvedTile: (
    resolved: ResolvedTileset,
    coords: TileCoordinates,
  ) => Promise<TileReadResult>;
  queryResolvedTileset: (
    resolved: ResolvedTileset,
    coords: { lon: number; lat: number },
    options: TileQueryOptions,
  ) => Promise<TileQueryResult>;
};

const defaultDeps: TileWorkerDeps = {
  resolveTileset,
  readResolvedTile,
  queryResolvedTileset,
};

export function createTileWorkerApp(deps: Partial<TileWorkerDeps> = {}): Hono {
  const services = { ...defaultDeps, ...deps };
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "tile-worker",
      version: env.APP_VERSION,
    }),
  );

  app.get("/tiles/v1/:source/:z/:x/:y", async (c) => {
    const { source, z, x, y } = c.req.param();
    const parsed = parsePublicTilesetSlug(source);
    if (!parsed) {
      return jsonError(c, 404, "NOT_FOUND", "Tileset not found");
    }
    return serveTile(services, c, parsed.owner, parsed.handle, parsed.version, {
      z,
      x,
      y,
    });
  });

  app.get("/tiles/v1/:owner/:handle/versions/:version/:z/:x/:y", async (c) => {
    const { owner, handle, version, z, x, y } = c.req.param();
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "Invalid tileset version");
    }
    return serveTile(services, c, owner, handle, versionNumber, { z, x, y });
  });

  app.get("/tiles/v1/:owner/:handle/:z/:x/:y", async (c) => {
    const { owner, handle, z, x, y } = c.req.param();
    return serveTile(services, c, owner, handle, undefined, { z, x, y });
  });

  app.get("/v4/:tileset/tilequery/:coords.json", async (c) => {
    const route = parseTileQueryRoutePath(new URL(c.req.url).pathname);
    const tileset = route ? parsePublicTilesetSlug(route.tileset) : null;
    const coords = route ? parseTileQueryCoordinates(route.coords) : null;
    const options = parseTileQueryOptions(c.req.query());
    if (!tileset || !coords || !options) {
      return jsonError(c, 400, "VALIDATION_ERROR", "Invalid tilequery request");
    }

    const resolved = await services.resolveTileset(
      tileset.owner,
      tileset.handle,
      tileset.version,
    );
    if (!resolved?.version) {
      return jsonError(c, 404, "NOT_FOUND", "Tileset not found");
    }

    const result = await services.queryResolvedTileset(
      resolved,
      coords,
      options,
    );
    if (!result.ok) return runtimeError(c, result);

    for (const [name, value] of Object.entries(result.headers)) {
      c.header(name, value);
    }
    return c.json(result.collection);
  });

  return app;
}

export const app = createTileWorkerApp();

async function serveTile(
  services: TileWorkerDeps,
  c: Context,
  owner: string,
  handle: string,
  version: number | undefined,
  rawCoords: { z: string; x: string; y: string },
) {
  const coords = parseTileCoordinates(rawCoords.z, rawCoords.x, rawCoords.y);
  if (!coords) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Invalid tile coordinates");
  }

  const resolved = await services.resolveTileset(owner, handle, version);
  if (!resolved?.version) {
    return jsonError(c, 404, "NOT_FOUND", "Tileset not found");
  }

  const result = await services.readResolvedTile(resolved, coords);
  if (!result.ok) return runtimeError(c, result);

  const headers = new Headers({
    "Content-Type": result.contentType,
    "Cache-Control": result.cacheControl,
    "Access-Control-Allow-Origin": "*",
  });
  if (result.expires) headers.set("Expires", result.expires);

  return new Response(toResponseArrayBuffer(result.data), { headers });
}

function runtimeError(c: Context, error: TileRuntimeError) {
  if (error.cause) {
    console.error("[tile-worker] tile runtime error:", error.cause);
  }
  return jsonError(c, error.status, error.code, error.message);
}

function parseTileQueryRoutePath(pathname: string) {
  const match = pathname.match(/^\/v4\/([^/]+)\/tilequery\/(.+)\.json$/);
  if (!match) return null;
  return {
    tileset: decodeURIComponent(match[1]!),
    coords: decodeURIComponent(match[2]!),
  };
}

function jsonError(
  c: Context,
  status: 400 | 404 | 500 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

export function emptyFeatureCollection(): GeoJsonFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function toResponseArrayBuffer(data: Uint8Array | ArrayBuffer) {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}
