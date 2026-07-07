import assert from "node:assert/strict";
import test from "node:test";
import type { Readable } from "node:stream";
import { TileType } from "pmtiles";
import type { StorageProvider, StoredObject } from "@planisfy/storage";
import {
  apiBaseFromUrl,
  contentTypeForTileType,
  extractVectorLayers,
  lonLatToTile,
  parseTileCoordinates,
  parseTileQueryCoordinates,
  parseTileQueryOptions,
  parsePublicTilesetSlug,
  parseStableTileJsonPath,
  parseVersionedTileJsonPath,
  publicTilesetBaseUrl,
  verifyTileJsonArtifact,
} from "@planisfy/tile-runtime";
import {
  buildMartinSourceUrl,
  buildMartinTileUrl,
  martinTileResponseHeaders,
  tileWorkerUrlForPath,
} from "./route";

test("parsePublicTilesetSlug accepts stable and immutable dotted aliases", () => {
  assert.deepEqual(parsePublicTilesetSlug("acme.roads"), {
    owner: "acme",
    handle: "roads",
    version: undefined,
  });
  assert.deepEqual(parsePublicTilesetSlug("acme.roads@4"), {
    owner: "acme",
    handle: "roads",
    version: 4,
  });
  assert.equal(parsePublicTilesetSlug("Acme.roads"), null);
  assert.equal(parsePublicTilesetSlug("acme.roads@0"), null);
});

test("TileJSON path parsing preserves owner and handle segments", () => {
  assert.deepEqual(
    parseStableTileJsonPath(
      "/tiles/v1/qa_platform_44bee746/qa-minio-streets.json",
    ),
    {
      owner: "qa_platform_44bee746",
      handle: "qa-minio-streets",
      version: undefined,
    },
  );
  assert.deepEqual(
    parseStableTileJsonPath(
      "/tiles/v1/qa_platform_44bee746/qa-minio-streets@2.json",
    ),
    { owner: "qa_platform_44bee746", handle: "qa-minio-streets", version: 2 },
  );
  assert.equal(
    parseStableTileJsonPath(
      "/tiles/v1/qa_platform_44bee746/qa-minio-streets@0.json",
    ),
    null,
  );
  assert.deepEqual(
    parseVersionedTileJsonPath(
      "/tiles/v1/qa_platform_44bee746/qa-minio-streets/versions/2.json",
    ),
    { owner: "qa_platform_44bee746", handle: "qa-minio-streets", version: 2 },
  );
  assert.equal(
    parseVersionedTileJsonPath(
      "/tiles/v1/qa_platform_44bee746/qa-minio-streets/versions/0.json",
    ),
    null,
  );
});

test("publicTilesetBaseUrl preserves stable and immutable URL contracts", () => {
  const params = {
    apiBase: "https://api.example.com",
    owner: "acme",
    handle: "roads",
    version: 3,
  };

  assert.equal(
    publicTilesetBaseUrl({ ...params, mode: "stable" }),
    "https://api.example.com/tiles/v1/acme/roads",
  );
  assert.equal(
    publicTilesetBaseUrl({ ...params, mode: "version" }),
    "https://api.example.com/tiles/v1/acme/roads/versions/3",
  );
  assert.equal(
    publicTilesetBaseUrl({ ...params, mode: "dotted-stable" }),
    "https://api.example.com/tiles/v1/acme.roads",
  );
  assert.equal(
    publicTilesetBaseUrl({ ...params, mode: "dotted-version" }),
    "https://api.example.com/tiles/v1/acme.roads@3",
  );
});

test("apiBaseFromUrl and extractVectorLayers normalize TileJSON contracts", () => {
  assert.equal(
    apiBaseFromUrl("https://api.example.com/tiles/v1/acme/roads.json"),
    "https://api.example.com",
  );
  assert.deepEqual(
    extractVectorLayers({ vector_layers: [{ id: "roads", fields: {} }] }),
    [{ id: "roads", fields: {} }],
  );
  assert.deepEqual(extractVectorLayers({}), [{ id: "data", fields: {} }]);
});

test("parseTileCoordinates accepts only valid XYZ coordinates", () => {
  assert.deepEqual(parseTileCoordinates("0", "0", "0"), { z: 0, x: 0, y: 0 });
  assert.deepEqual(parseTileCoordinates("3", "7", "7"), { z: 3, x: 7, y: 7 });

  assert.equal(parseTileCoordinates("-1", "0", "0"), null);
  assert.equal(parseTileCoordinates("27", "0", "0"), null);
  assert.equal(parseTileCoordinates("3", "8", "0"), null);
  assert.equal(parseTileCoordinates("3", "0", "8"), null);
  assert.equal(parseTileCoordinates("3.1", "0", "0"), null);
});

test("Martin source URLs allow only safe source names", () => {
  assert.equal(
    buildMartinSourceUrl("http://martin:3000/", "public.tiles_v1"),
    "http://martin:3000/public.tiles_v1",
  );
  assert.equal(buildMartinSourceUrl("http://martin:3000", "../secret"), null);
  assert.equal(buildMartinSourceUrl("http://martin:3000", "schema/table"), null);
  assert.equal(buildMartinSourceUrl("http://martin:3000", "source?x=1"), null);
  assert.equal(buildMartinSourceUrl("http://martin:3000", "source#frag"), null);
});

test("Martin tile URLs validate coordinates and encode path segments", () => {
  assert.equal(
    buildMartinTileUrl("http://martin:3000/", "owner.tiles_v1/0/0/0"),
    "http://martin:3000/owner.tiles_v1/0/0/0",
  );
  assert.equal(buildMartinTileUrl("http://martin:3000", "owner/27/0/0"), null);
  assert.equal(buildMartinTileUrl("http://martin:3000", "owner/3/8/0"), null);
  assert.equal(buildMartinTileUrl("http://martin:3000", "owner/3/0/0?x=1"), null);
  assert.equal(buildMartinTileUrl("http://martin:3000", "../owner/0/0/0"), null);
});

test("Martin tile proxy drops stale upstream content encoding", () => {
  const headers = new Headers({
    "content-type": "application/x-protobuf",
    "content-encoding": "gzip",
  });
  assert.deepEqual(martinTileResponseHeaders(headers), {
    contentType: "application/x-protobuf",
    cacheControl: "public, max-age=3600",
    accessControlAllowOrigin: "*",
  });
});

test("tile worker proxy URLs preserve public tile paths only", () => {
  assert.equal(
    tileWorkerUrlForPath(
      "http://tile-worker:4020/",
      "/tiles/v1/acme.roads/1/0/1",
    ),
    "http://tile-worker:4020/tiles/v1/acme.roads/1/0/1",
  );
  assert.equal(
    tileWorkerUrlForPath(
      "http://tile-worker:4020",
      "/v4/acme.roads/tilequery/0,0.json?limit=1",
    ),
    "http://tile-worker:4020/v4/acme.roads/tilequery/0,0.json?limit=1",
  );
  assert.equal(tileWorkerUrlForPath("", "/tiles/v1/acme.roads/1/0/1"), null);
  assert.equal(
    tileWorkerUrlForPath("http://tile-worker:4020", "tiles/v1"),
    null,
  );
  assert.equal(
    tileWorkerUrlForPath("http://tile-worker:4020", "/internal/health"),
    null,
  );
});

test("tilequery coordinate parsing and options validate inputs", () => {
  assert.deepEqual(parseTileQueryCoordinates("-73.9857,40.7484"), {
    lon: -73.9857,
    lat: 40.7484,
  });
  assert.equal(parseTileQueryCoordinates("-181,0"), null);
  assert.equal(parseTileQueryCoordinates("0,90"), null);
  assert.equal(parseTileQueryCoordinates("bad"), null);

  assert.deepEqual(
    parseTileQueryOptions({
      z: "14",
      radius: "25",
      limit: "3",
      layers: "roads,pois",
      geometry: "full",
    }),
    {
      z: 14,
      radius: 25,
      limit: 3,
      layers: ["roads", "pois"],
      geometry: "full",
    },
  );
  assert.equal(parseTileQueryOptions({ z: "27" }), null);
  assert.equal(parseTileQueryOptions({ limit: "0" }), null);
  assert.equal(parseTileQueryOptions({ geometry: "centroid" }), null);
});

test("tilequery lon/lat conversion returns bounded XYZ tile coordinates", () => {
  assert.deepEqual(lonLatToTile(0, 0, 0), { z: 0, x: 0, y: 0 });
  assert.deepEqual(lonLatToTile(179.999, 85, 2), { z: 2, x: 3, y: 0 });
});

test("contentTypeForTileType maps PMTiles tile types to HTTP content types", () => {
  assert.equal(
    contentTypeForTileType(TileType.Mvt),
    "application/vnd.mapbox-vector-tile",
  );
  assert.equal(contentTypeForTileType(TileType.Png), "image/png");
  assert.equal(contentTypeForTileType(TileType.Jpeg), "image/jpeg");
  assert.equal(
    contentTypeForTileType(TileType.Unknown),
    "application/octet-stream",
  );
});

test("verifyTileJsonArtifact confirms PMTiles artifact availability", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", [
    "tiles.pmtiles",
  ]);
  const result = await verifyTileJsonArtifact(
    {
      version: { format: "PMTILES" },
      artifact: {
        provider: "s3",
        bucket: "planisfy-artifacts",
        storageKey: "tiles.pmtiles",
      },
    },
    storage,
  );

  assert.deepEqual(result, { ok: true });
});

test("verifyTileJsonArtifact marks missing PMTiles artifacts as unavailable", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", []);
  const result = await verifyTileJsonArtifact(
    {
      version: { format: "PMTILES" },
      artifact: {
        provider: "s3",
        bucket: "planisfy-artifacts",
        storageKey: "tiles.pmtiles",
      },
    },
    storage,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ARTIFACT_MISSING");
  }
});

test("verifyTileJsonArtifact marks storage provider mismatches as unavailable", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", [
    "tiles.pmtiles",
  ]);
  const result = await verifyTileJsonArtifact(
    {
      version: { format: "PMTILES" },
      artifact: {
        provider: "r2",
        bucket: "planisfy-artifacts",
        storageKey: "tiles.pmtiles",
      },
    },
    storage,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ARTIFACT_STORAGE_UNAVAILABLE");
  }
});

class MemoryStorage implements StorageProvider {
  constructor(
    private provider: "local" | "s3" | "r2",
    private bucket: string,
    private keys: string[],
  ) {}

  async upload(
    key: string,
    _data: Buffer | Readable,
    contentType = "application/octet-stream",
  ): Promise<StoredObject> {
    this.keys.push(key);
    return {
      key,
      url: this.getUrl(key),
      size: 0,
      contentType,
    };
  }

  async download(): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async readRange(): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async createDownloadUrl(key: string) {
    return this.getUrl(key);
  }

  async copy() {
    throw new Error("Not implemented");
  }

  async delete() {
    throw new Error("Not implemented");
  }

  async exists(key: string) {
    return this.keys.includes(key);
  }

  async getMetadata(key: string) {
    if (!this.keys.includes(key)) return null;
    return { key, size: 0, contentType: "application/octet-stream" };
  }

  getUrl(key: string) {
    return `memory://${key}`;
  }

  getInfo() {
    return { provider: this.provider, bucket: this.bucket };
  }
}
