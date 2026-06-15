import { Hono, type Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { VectorTile } from "@mapbox/vector-tile";
import {
  db,
  accounts,
  storageObjects,
  tilesetVersions,
  tilesets,
} from "@planisfy/database";
import { getStorage, type StorageProvider } from "@planisfy/storage";
import Protobuf from "pbf";
import {
  PMTiles,
  SharedPromiseCache,
  TileType,
  type RangeResponse,
  type Source,
} from "pmtiles";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";
import {
  verifyStorageArtifactAvailable,
  type StorageArtifactAvailability,
} from "../lib/storage-artifact-availability";

export const tilesRoute = new Hono<AuthEnv>();
type ApiContext = Context<AuthEnv>;
type ResolvedTileset = NonNullable<Awaited<ReturnType<typeof resolveTileset>>>;

const pmtilesCache = new SharedPromiseCache(200);

type TileQueryGeometryMode = "point" | "full";
type TileQueryOptions = {
  z?: number;
  radius: number;
  limit: number;
  layers?: string[];
  geometry: TileQueryGeometryMode;
};

type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry | null;
};

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

// Stable owner/tileset TileJSON resolves to the promoted current version.
// Inline @version suffixes are accepted for copied/version-pinned URLs.
tilesRoute.get("/tiles/v1/:owner/:handle.json", async (c) => {
  const parsed = parseStableTileJsonPath(new URL(c.req.url).pathname);
  if (!parsed) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  const resolved = await resolveTileset(
    parsed.owner,
    parsed.handle,
    parsed.version,
  );
  if (!resolved?.version) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: parsed.version
            ? "Tileset version not found"
            : "Tileset not found",
        },
      },
      404,
    );
  }
  const artifactAvailability = await verifyTileJsonArtifact(resolved);
  if (!artifactAvailability.ok) {
    return tileJsonArtifactError(c, artifactAvailability);
  }

  return c.json(
    toTileJson(resolved, parsed.version ? "version" : "stable"),
    200,
    {
      "Cache-Control": parsed.version
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      ETag: `"tileset-${resolved.version.id}"`,
    },
  );
});

// Immutable version TileJSON.
tilesRoute.get("/tiles/v1/:owner/:handle/versions/:version.json", async (c) => {
  const parsed = parseVersionedTileJsonPath(new URL(c.req.url).pathname);
  if (!parsed) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tileset version",
        },
      },
      400,
    );
  }

  const resolved = await resolveTileset(
    parsed.owner,
    parsed.handle,
    parsed.version,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
      404,
    );
  }
  const artifactAvailability = await verifyTileJsonArtifact(resolved);
  if (!artifactAvailability.ok) {
    return tileJsonArtifactError(c, artifactAvailability);
  }

  return c.json(toTileJson(resolved, "version"), 200, {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"tileset-${resolved.version.id}"`,
  });
});

// Dotted public aliases:
// /tiles/v1/{owner}.{handle}.json
// /tiles/v1/{owner}.{handle}@{version}.json
tilesRoute.get("/tiles/v1/:source{.+\\.json$}", async (c) => {
  const source = c.req.param("source").replace(/\.json$/, "");
  const parsed = parsePublicTilesetSlug(source);

  if (parsed) {
    const resolved = await resolveTileset(
      parsed.owner,
      parsed.handle,
      parsed.version,
    );
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset not found" } },
        404,
      );
    }
    const artifactAvailability = await verifyTileJsonArtifact(resolved);
    if (!artifactAvailability.ok) {
      return tileJsonArtifactError(c, artifactAvailability);
    }

    return c.json(
      toTileJson(resolved, parsed.version ? "dotted-version" : "dotted-stable"),
      200,
      {
        "Cache-Control": parsed.version
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        ETag: `"tileset-${resolved.version.id}"`,
      },
    );
  }

  return legacyMartinTileJson(c, source);
});

// Dotted and legacy Martin tile proxy.
tilesRoute.get("/tiles/v1/:source/:z/:x/:y", async (c) => {
  const { source, z, x, y } = c.req.param();
  const parsed = parsePublicTilesetSlug(source);

  if (parsed) {
    const resolved = await resolveTileset(
      parsed.owner,
      parsed.handle,
      parsed.version,
    );
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset not found" } },
        404,
      );
    }

    const martinSource = parsed.version
      ? `${parsed.owner}.${parsed.handle}.v${parsed.version}`
      : `${parsed.owner}.${parsed.handle}`;
    return serveResolvedTile(c, resolved, z, x, y, () =>
      proxyMartinTile(c, `${martinSource}/${z}/${x}/${y}`),
    );
  }

  return proxyMartinTile(c, `${source}/${z}/${x}/${y}`);
});

// Versioned owner/tileset tile proxy. Martin source names are conventional and
// can be mapped by deployment glue; TileJSON above is the stable contract.
tilesRoute.get(
  "/tiles/v1/:owner/:handle/versions/:version/:z/:x/:y",
  async (c) => {
    const { owner, handle, version, z, x, y } = c.req.param();
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid tileset version",
          },
        },
        400,
      );
    }

    const resolved = await resolveTileset(owner, handle, versionNumber);
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
        404,
      );
    }

    return serveResolvedTile(c, resolved, z, x, y, () =>
      proxyMartinTile(c, `${owner}.${handle}.v${version}/${z}/${x}/${y}`),
    );
  },
);

tilesRoute.get("/tiles/v1/:owner/:handle/:z/:x/:y", async (c) => {
  const { owner, handle, z, x, y } = c.req.param();
  const resolved = await resolveTileset(owner, handle);
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  return serveResolvedTile(c, resolved, z, x, y, () =>
    proxyMartinTile(c, `${owner}.${handle}/${z}/${x}/${y}`),
  );
});

tilesRoute.get("/v4/:tileset/tilequery/:coords.json", async (c) => {
  const tileset = parsePublicTilesetSlug(c.req.param("tileset") ?? "");
  const coords = parseTileQueryCoordinates(c.req.param("coords") ?? "");
  const options = parseTileQueryOptions(c.req.query());

  if (!tileset || !coords || !options) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tilequery request",
        },
      },
      400,
    );
  }

  const resolved = await resolveTileset(
    tileset.owner,
    tileset.handle,
    tileset.version,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }
  if (resolved.version.format !== "PMTILES" || !resolved.artifact) {
    return c.json(
      {
        error: {
          code: "UNSUPPORTED_TILEQUERY",
          message: "Tilequery is only available for PMTiles vector tilesets.",
        },
      },
      400,
    );
  }

  try {
    const storage = getStorage();
    const storageInfo = storage.getInfo();
    if (
      resolved.artifact.provider !== storageInfo.provider ||
      (resolved.artifact.bucket &&
        resolved.artifact.bucket !== storageInfo.bucket)
    ) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Tileset storage is not available from this API instance",
          },
        },
        503,
      );
    }

    const archive = new PMTiles(
      new StorageSource(storage, {
        provider: resolved.artifact.provider,
        bucket: resolved.artifact.bucket ?? storageInfo.bucket,
        key: resolved.artifact.storageKey,
      }),
      pmtilesCache,
    );
    const header = await archive.getHeader();
    if (header.tileType !== TileType.Mvt) {
      return c.json(
        {
          error: {
            code: "UNSUPPORTED_TILEQUERY",
            message: "Tilequery is only available for vector tiles.",
          },
        },
        400,
      );
    }

    const z = options.z ?? resolved.version.maxZoom ?? header.maxZoom ?? 14;
    const tileCoords = lonLatToTile(coords.lon, coords.lat, z);
    const tile = await archive.getZxy(tileCoords.z, tileCoords.x, tileCoords.y);
    if (!tile) {
      return c.json(emptyFeatureCollection(), 200, tileQueryHeaders());
    }

    const collection = queryVectorTile({
      data: tile.data,
      tile: tileCoords,
      lon: coords.lon,
      lat: coords.lat,
      options,
    });

    return c.json(collection, 200, tileQueryHeaders());
  } catch (err) {
    console.error("[tiles] tilequery error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tilequery failed" } },
      500,
    );
  }
});

async function legacyMartinTileJson(c: ApiContext, source: string) {
  try {
    const martinUrl = `${env.MARTIN_URL}/${source}`;
    const res = await fetch(martinUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Source not found" } },
        404,
      );
    }

    const tileJson = (await res.json()) as { tiles?: string[] };
    const apiBase = publicApiBaseFromEnv();
    tileJson.tiles = [`${apiBase}/tiles/v1/${source}/{z}/{x}/{y}`];

    c.header("Cache-Control", "public, max-age=300");
    return c.json(tileJson);
  } catch {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503,
    );
  }
}

async function proxyMartinTile(c: ApiContext, path: string) {
  try {
    const res = await fetch(`${env.MARTIN_URL}/${path}`);

    if (!res.ok) {
      if (res.status === 404) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tile not found" } },
          404,
        );
      }
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Tile server error" } },
        502,
      );
    }

    const body = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") || "application/x-protobuf";
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
      503,
    );
  }
}

async function serveResolvedTile(
  c: ApiContext,
  resolved: ResolvedTileset,
  z: string,
  x: string,
  y: string,
  fallback: () => Promise<Response>,
) {
  const coords = parseTileCoordinates(z, x, y);
  if (!coords) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tile coordinates",
        },
      },
      400,
    );
  }

  if (resolved.version?.format !== "PMTILES" || !resolved.artifact) {
    return fallback();
  }

  try {
    const storage = getStorage();
    const storageInfo = storage.getInfo();
    if (
      resolved.artifact.provider !== storageInfo.provider ||
      (resolved.artifact.bucket &&
        resolved.artifact.bucket !== storageInfo.bucket)
    ) {
      console.error("[tiles] Storage provider mismatch", {
        artifactProvider: resolved.artifact.provider,
        artifactBucket: resolved.artifact.bucket,
        configuredProvider: storageInfo.provider,
        configuredBucket: storageInfo.bucket,
      });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Tileset storage is not available from this API instance",
          },
        },
        503,
      );
    }

    const archive = new PMTiles(
      new StorageSource(storage, {
        provider: resolved.artifact.provider,
        bucket: resolved.artifact.bucket ?? storageInfo.bucket,
        key: resolved.artifact.storageKey,
      }),
      pmtilesCache,
    );
    const tile = await archive.getZxy(coords.z, coords.x, coords.y);
    if (!tile) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tile not found" } },
        404,
      );
    }

    const header = await archive.getHeader();
    c.header("Content-Type", contentTypeForTileType(header.tileType));
    c.header("Cache-Control", tile.cacheControl ?? "public, max-age=3600");
    c.header("Access-Control-Allow-Origin", "*");
    if (tile.expires) c.header("Expires", tile.expires);

    return c.body(tile.data);
  } catch (err) {
    console.error("[tiles] PMTiles storage proxy error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503,
    );
  }
}

async function resolveTileset(
  ownerHandle: string,
  handle: string,
  versionNumber?: number,
) {
  const [owner] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.handle, ownerHandle), isNull(accounts.deletedAt)))
    .limit(1);

  if (!owner) return null;

  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.accountId, owner.id),
        eq(tilesets.handle, handle),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);

  if (!tileset) return null;

  const versionWhere = versionNumber
    ? and(
        eq(tilesetVersions.tilesetId, tileset.id),
        eq(tilesetVersions.version, versionNumber),
      )
    : eq(
        tilesetVersions.id,
        tileset.currentVersionId ?? "00000000-0000-0000-0000-000000000000",
      );
  const [version] = await db
    .select()
    .from(tilesetVersions)
    .where(versionWhere)
    .limit(1);

  const [artifact] = version?.artifactStorageObjectId
    ? await db
        .select({
          provider: storageObjects.provider,
          bucket: storageObjects.bucket,
          storageKey: storageObjects.storageKey,
        })
        .from(storageObjects)
        .where(eq(storageObjects.id, version.artifactStorageObjectId))
        .limit(1)
    : [];

  return { owner: ownerHandle, tileset, version, artifact };
}

function toTileJson(
  resolved: ResolvedTileset,
  mode: "stable" | "version" | "dotted-stable" | "dotted-version",
) {
  const apiBase = publicApiBaseFromEnv();
  const tilesBase = publicTilesetBaseUrl({
    apiBase,
    owner: resolved.owner,
    handle: resolved.tileset.handle,
    version: resolved.version!.version,
    mode,
  });

  return {
    tilejson: "3.0.0",
    name: resolved.tileset.name,
    description: resolved.tileset.description ?? undefined,
    version: String(resolved.version!.version),
    scheme: "xyz",
    tiles: [`${tilesBase}/{z}/{x}/{y}`],
    minzoom: resolved.version!.minZoom ?? resolved.tileset.minZoom ?? 0,
    maxzoom: resolved.version!.maxZoom ?? resolved.tileset.maxZoom ?? 14,
    bounds: resolved.version!.bounds ?? resolved.tileset.bounds ?? undefined,
    vector_layers: extractVectorLayers(
      resolved.version!.schema ?? resolved.tileset.layerMetadata,
    ),
    artifact: resolved.artifact?.storageKey,
  };
}

export async function verifyTileJsonArtifact(
  resolved: {
    version?: { format?: string } | null;
    artifact?: {
      provider: string;
      bucket?: string | null;
      storageKey: string;
    } | null;
  },
  storage: StorageProvider = getStorage(),
): Promise<StorageArtifactAvailability> {
  if (resolved.version?.format !== "PMTILES") return { ok: true };
  const availability = await verifyStorageArtifactAvailable(
    resolved.artifact,
    storage,
  );
  if (!availability.ok && availability.code === "ARTIFACT_MISSING") {
    return {
      ok: false,
      code: "ARTIFACT_MISSING",
      message: "Published tileset artifact is missing from storage.",
    };
  }
  return availability;
}

function tileJsonArtifactError(
  c: ApiContext,
  availability: Exclude<StorageArtifactAvailability, { ok: true }>,
) {
  c.header("Cache-Control", "no-store");
  return c.json(
    {
      error: {
        code: availability.code,
        message: availability.message,
      },
    },
    503,
  );
}

export function extractVectorLayers(schema: unknown) {
  if (
    typeof schema === "object" &&
    schema !== null &&
    "vector_layers" in schema &&
    Array.isArray(schema.vector_layers)
  ) {
    return schema.vector_layers;
  }

  return [{ id: "data", fields: {} }];
}

export function apiBaseFromUrl(url: string) {
  const baseUrl = new URL(url);
  return `${baseUrl.protocol}//${baseUrl.host}`;
}

export function publicApiBaseFromEnv() {
  return env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
}

export function parsePublicTilesetSlug(slug: string) {
  const match = slug.match(
    /^([a-z0-9][a-z0-9_-]*)\.([a-z0-9][a-z0-9_-]*)(?:@([1-9]\d*))?$/,
  );
  if (!match) return null;

  return {
    owner: match[1]!,
    handle: match[2]!,
    version: match[3] ? Number(match[3]) : undefined,
  };
}

export function parseStableTileJsonPath(pathname: string) {
  const match = pathname.match(
    /\/tiles\/v1\/([^/]+)\/([^/@]+)(?:@([1-9]\d*))?\.json$/,
  );
  if (!match) return null;

  return {
    owner: decodeURIComponent(match[1]!),
    handle: decodeURIComponent(match[2]!),
    version: match[3] ? Number(match[3]) : undefined,
  };
}

export function parseVersionedTileJsonPath(pathname: string) {
  const match = pathname.match(
    /\/tiles\/v1\/([^/]+)\/([^/]+)\/versions\/([1-9]\d*)\.json$/,
  );
  if (!match) return null;

  return {
    owner: decodeURIComponent(match[1]!),
    handle: decodeURIComponent(match[2]!),
    version: Number(match[3]),
  };
}

export function publicTilesetBaseUrl(params: {
  apiBase: string;
  owner: string;
  handle: string;
  version: number;
  mode: "stable" | "version" | "dotted-stable" | "dotted-version";
}) {
  if (params.mode === "version") {
    return `${params.apiBase}/tiles/v1/${params.owner}/${params.handle}/versions/${params.version}`;
  }
  if (params.mode === "dotted-version") {
    return `${params.apiBase}/tiles/v1/${params.owner}.${params.handle}@${params.version}`;
  }
  if (params.mode === "dotted-stable") {
    return `${params.apiBase}/tiles/v1/${params.owner}.${params.handle}`;
  }
  return `${params.apiBase}/tiles/v1/${params.owner}/${params.handle}`;
}

export function parseTileCoordinates(z: string, x: string, y: string) {
  const parsed = {
    z: Number(z),
    x: Number(x),
    y: Number(y),
  };
  if (
    !Number.isInteger(parsed.z) ||
    !Number.isInteger(parsed.x) ||
    !Number.isInteger(parsed.y) ||
    parsed.z < 0 ||
    parsed.z > 26 ||
    parsed.x < 0 ||
    parsed.y < 0 ||
    parsed.x >= 2 ** parsed.z ||
    parsed.y >= 2 ** parsed.z
  ) {
    return null;
  }
  return parsed;
}

export function parseTileQueryCoordinates(value: string) {
  const match = value.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -85.051129 ||
    lat > 85.051129
  ) {
    return null;
  }
  return { lon, lat };
}

export function parseTileQueryOptions(
  query: Record<string, string | string[]>,
): TileQueryOptions | null {
  const z = singleQueryValue(query.z);
  const radius = singleQueryValue(query.radius);
  const limit = singleQueryValue(query.limit);
  const layers = singleQueryValue(query.layers);
  const geometry = singleQueryValue(query.geometry);

  const parsedZ = z === undefined ? undefined : Number(z);
  const parsedRadius = radius === undefined ? 0 : Number(radius);
  const parsedLimit = limit === undefined ? 5 : Number(limit);
  const parsedGeometry = geometry ?? "point";

  if (
    (parsedZ !== undefined &&
      (!Number.isInteger(parsedZ) || parsedZ < 0 || parsedZ > 26)) ||
    !Number.isFinite(parsedRadius) ||
    parsedRadius < 0 ||
    parsedRadius > 10_000 ||
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > 100 ||
    (parsedGeometry !== "point" && parsedGeometry !== "full")
  ) {
    return null;
  }

  return {
    z: parsedZ,
    radius: parsedRadius,
    limit: parsedLimit,
    layers: layers
      ?.split(",")
      .map((layer) => layer.trim())
      .filter(Boolean),
    geometry: parsedGeometry,
  };
}

export function lonLatToTile(lon: number, lat: number, z: number) {
  const scale = 2 ** z;
  const x = Math.min(
    scale - 1,
    Math.max(0, Math.floor(((lon + 180) / 360) * scale)),
  );
  const latRad = (lat * Math.PI) / 180;
  const y = Math.min(
    scale - 1,
    Math.max(
      0,
      Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
          2) *
          scale,
      ),
    ),
  );
  return { z, x, y };
}

function queryVectorTile(params: {
  data: Uint8Array | ArrayBuffer;
  tile: { z: number; x: number; y: number };
  lon: number;
  lat: number;
  options: TileQueryOptions;
}): GeoJsonFeatureCollection {
  const vectorTile = new VectorTile(new Protobuf(toUint8Array(params.data)));
  const layerFilter = new Set(params.options.layers ?? []);
  const features: GeoJsonFeature[] = [];

  for (const layerName of Object.keys(vectorTile.layers)) {
    if (layerFilter.size > 0 && !layerFilter.has(layerName)) continue;
    const layer = vectorTile.layers[layerName]!;
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      const geojson = feature.toGeoJSON(
        params.tile.x,
        params.tile.y,
        params.tile.z,
      ) as GeoJsonFeature;
      if (
        !geojson.geometry ||
        !geometryNearPoint(
          geojson.geometry,
          params.lon,
          params.lat,
          params.options.radius,
        )
      ) {
        continue;
      }

      features.push({
        ...geojson,
        properties: { ...geojson.properties, layer: layerName },
        geometry:
          params.options.geometry === "full"
            ? geojson.geometry
            : representativePointGeometry(
                geojson.geometry,
                params.lon,
                params.lat,
              ),
      });

      if (features.length >= params.options.limit) {
        return { type: "FeatureCollection", features };
      }
    }
  }

  return { type: "FeatureCollection", features };
}

function geometryNearPoint(
  geometry: GeoJsonGeometry,
  lon: number,
  lat: number,
  radiusMeters: number,
) {
  const bbox = geometryBbox(geometry);
  if (!bbox) return false;
  if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) {
    return true;
  }
  if (radiusMeters === 0) return false;
  return (
    minCoordinateDistanceMeters(geometry.coordinates, lon, lat) <= radiusMeters
  );
}

function representativePointGeometry(
  geometry: GeoJsonGeometry,
  lon: number,
  lat: number,
): GeoJsonGeometry {
  return {
    type: "Point",
    coordinates: nearestCoordinate(geometry.coordinates, lon, lat) ?? [
      lon,
      lat,
    ],
  };
}

function geometryBbox(geometry: GeoJsonGeometry) {
  const coords = flattenCoordinates(geometry.coordinates);
  if (coords.length === 0) return null;
  return coords.reduce<[number, number, number, number]>(
    (bbox, coord) => [
      Math.min(bbox[0], coord[0]),
      Math.min(bbox[1], coord[1]),
      Math.max(bbox[2], coord[0]),
      Math.max(bbox[3], coord[1]),
    ],
    [coords[0]![0], coords[0]![1], coords[0]![0], coords[0]![1]],
  );
}

function minCoordinateDistanceMeters(
  coordinates: unknown,
  lon: number,
  lat: number,
) {
  const nearest = nearestCoordinate(coordinates, lon, lat);
  return nearest ? haversineMeters(lon, lat, nearest[0], nearest[1]) : Infinity;
}

function nearestCoordinate(coordinates: unknown, lon: number, lat: number) {
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const coord of flattenCoordinates(coordinates)) {
    const distance = haversineMeters(lon, lat, coord[0], coord[1]);
    if (distance < bestDistance) {
      best = coord;
      bestDistance = distance;
    }
  }
  return best;
}

function flattenCoordinates(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  if (
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    return [[value[0], value[1]]];
  }
  return value.flatMap((child) => flattenCoordinates(child));
}

function haversineMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
) {
  const radius = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function emptyFeatureCollection(): GeoJsonFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function tileQueryHeaders() {
  return {
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  };
}

export function contentTypeForTileType(tileType: TileType) {
  switch (tileType) {
    case TileType.Mvt:
      return "application/vnd.mapbox-vector-tile";
    case TileType.Png:
      return "image/png";
    case TileType.Jpeg:
      return "image/jpeg";
    case TileType.Webp:
      return "image/webp";
    case TileType.Avif:
      return "image/avif";
    case TileType.Mlt:
      return "application/vnd.maplibre-mvt";
    default:
      return "application/octet-stream";
  }
}

class StorageSource implements Source {
  constructor(
    private storage: StorageProvider,
    private object: { provider: string; bucket: string; key: string },
  ) {}

  getKey() {
    return `${this.object.provider}:${this.object.bucket}:${this.object.key}`;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
  ): Promise<RangeResponse> {
    void signal;
    const data = await this.storage.readRange(this.object.key, offset, length);
    return { data: toExactArrayBuffer(data) };
  }
}

function toExactArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

function toUint8Array(data: Uint8Array | ArrayBuffer) {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
