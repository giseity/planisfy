import { VectorTile } from "@mapbox/vector-tile";
import {
  accounts,
  db,
  storageObjects,
  tilesetVersions,
  tilesets,
} from "@planisfy/database";
import {
  getStorage,
  type StorageProvider,
  type StorageProviderInfo,
} from "@planisfy/storage";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import Protobuf from "pbf";
import {
  PMTiles,
  SharedPromiseCache,
  TileType,
  type RangeResponse,
  type Source,
} from "pmtiles";

const pmtilesCache = new SharedPromiseCache(200);

export type ResolvedTileset = NonNullable<
  Awaited<ReturnType<typeof resolveTileset>>
>;

export type ResolveTilesetAccess = "public" | "draft";

export type ResolveTilesetOptions = {
  access?: ResolveTilesetAccess;
};

export type TileCoordinates = {
  z: number;
  x: number;
  y: number;
};

export type TileQueryGeometryMode = "point" | "full";

export type TileQueryOptions = {
  z?: number;
  radius: number;
  limit: number;
  layers?: string[];
  geometry: TileQueryGeometryMode;
};

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry | null;
};

export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type TileRuntimeError = {
  ok: false;
  status: 400 | 404 | 500 | 503;
  code: string;
  message: string;
  cause?: unknown;
};

export type TileReadResult =
  | {
      ok: true;
      data: Uint8Array | ArrayBuffer;
      contentType: string;
      cacheControl: string;
      expires?: string;
    }
  | TileRuntimeError;

export type TileQueryResult =
  | {
      ok: true;
      collection: GeoJsonFeatureCollection;
      headers: Record<string, string>;
    }
  | TileRuntimeError;

export type StorageArtifactAvailability =
  | { ok: true }
  | {
      ok: false;
      code: "ARTIFACT_MISSING" | "ARTIFACT_STORAGE_UNAVAILABLE";
      message: string;
    };

export async function resolveTileset(
  ownerHandle: string,
  handle: string,
  versionNumber?: number,
  options: ResolveTilesetOptions = {},
) {
  const access = options.access ?? "public";
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

  const publishedConstraint =
    access === "public" ? isNotNull(tilesetVersions.publishedAt) : undefined;
  const versionWhere = versionNumber
    ? and(
        eq(tilesetVersions.tilesetId, tileset.id),
        eq(tilesetVersions.version, versionNumber),
        publishedConstraint,
      )
    : and(
        eq(
          tilesetVersions.id,
          tileset.currentVersionId ?? "00000000-0000-0000-0000-000000000000",
        ),
        publishedConstraint,
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
        .where(
          and(
            eq(storageObjects.id, version.artifactStorageObjectId),
            isNull(storageObjects.deletedAt),
          ),
        )
        .limit(1)
    : [];

  return { owner: ownerHandle, tileset, version, artifact };
}

export async function readResolvedTile(
  resolved: ResolvedTileset,
  coords: TileCoordinates,
  storage: StorageProvider = getStorage(),
): Promise<TileReadResult> {
  if (resolved.version?.format !== "PMTILES" || !resolved.artifact) {
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_TILE_SOURCE",
      message: "Tile serving requires a PMTiles-backed published tileset.",
    };
  }

  try {
    const archive = openPmtilesArchive(resolved, storage);
    if (!archive.ok) return archive;

    const tile = await archive.archive.getZxy(coords.z, coords.x, coords.y);
    if (!tile) {
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        message: "Tile not found",
      };
    }

    const header = await archive.archive.getHeader();
    return {
      ok: true,
      data: tile.data,
      contentType: contentTypeForTileType(header.tileType),
      cacheControl: tile.cacheControl ?? "public, max-age=3600",
      expires: tile.expires,
    };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      code: "INTERNAL_ERROR",
      message: "Tile server unavailable",
      cause: err,
    };
  }
}

export async function queryResolvedTileset(
  resolved: ResolvedTileset,
  coords: { lon: number; lat: number },
  options: TileQueryOptions,
  storage: StorageProvider = getStorage(),
): Promise<TileQueryResult> {
  if (resolved.version?.format !== "PMTILES" || !resolved.artifact) {
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_TILEQUERY",
      message: "Tilequery is only available for PMTiles vector tilesets.",
    };
  }

  try {
    const archive = openPmtilesArchive(resolved, storage);
    if (!archive.ok) return archive;

    const header = await archive.archive.getHeader();
    if (header.tileType !== TileType.Mvt) {
      return {
        ok: false,
        status: 400,
        code: "UNSUPPORTED_TILEQUERY",
        message: "Tilequery is only available for vector tiles.",
      };
    }

    const z = options.z ?? resolved.version.maxZoom ?? header.maxZoom ?? 14;
    const tileCoords = lonLatToTile(coords.lon, coords.lat, z);
    const tile = await archive.archive.getZxy(
      tileCoords.z,
      tileCoords.x,
      tileCoords.y,
    );

    if (!tile) {
      return {
        ok: true,
        collection: emptyFeatureCollection(),
        headers: tileQueryHeaders(),
      };
    }

    return {
      ok: true,
      collection: queryVectorTile({
        data: tile.data,
        tile: tileCoords,
        lon: coords.lon,
        lat: coords.lat,
        options,
      }),
      headers: tileQueryHeaders(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Tilequery failed",
      cause: err,
    };
  }
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
  const artifact = resolved.artifact;
  if (!artifact) {
    return {
      ok: false,
      code: "ARTIFACT_MISSING",
      message: "Published tileset artifact is missing from storage.",
    };
  }

  const storageInfo = storage.getInfo();
  if (
    artifact.provider !== storageInfo.provider ||
    (artifact.bucket && artifact.bucket !== storageInfo.bucket)
  ) {
    return {
      ok: false,
      code: "ARTIFACT_STORAGE_UNAVAILABLE",
      message: "Published tileset artifact is stored on a different provider.",
    };
  }

  const exists = await storage.exists(artifact.storageKey);
  if (!exists) {
    return {
      ok: false,
      code: "ARTIFACT_MISSING",
      message: "Published tileset artifact is missing from storage.",
    };
  }

  return { ok: true };
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

function openPmtilesArchive(
  resolved: ResolvedTileset,
  storage: StorageProvider,
):
  | { ok: true; archive: PMTiles }
  | Extract<TileReadResult | TileQueryResult, { ok: false }> {
  const storageInfo = storage.getInfo();
  if (!resolved.artifact) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Tileset artifact not found",
    };
  }
  if (!artifactAvailableToStorage(resolved.artifact, storageInfo)) {
    return {
      ok: false,
      status: 503,
      code: "INTERNAL_ERROR",
      message: "Tileset storage is not available from this service instance",
    };
  }

  return {
    ok: true,
    archive: new PMTiles(
      new StorageSource(storage, {
        provider: resolved.artifact.provider,
        bucket: resolved.artifact.bucket ?? storageInfo.bucket,
        key: resolved.artifact.storageKey,
      }),
      pmtilesCache,
    ),
  };
}

function artifactAvailableToStorage(
  artifact: { provider: string; bucket?: string | null },
  storageInfo: StorageProviderInfo,
) {
  return (
    artifact.provider === storageInfo.provider &&
    (!artifact.bucket || artifact.bucket === storageInfo.bucket)
  );
}

function queryVectorTile(params: {
  data: Uint8Array | ArrayBuffer;
  tile: TileCoordinates;
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
