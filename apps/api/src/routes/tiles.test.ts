import assert from "node:assert/strict";
import test from "node:test";
import { TileType } from "pmtiles";
import {
  apiBaseFromUrl,
  contentTypeForTileType,
  extractVectorLayers,
  parseTileCoordinates,
  parsePublicTilesetSlug,
  parseStableTileJsonPath,
  parseVersionedTileJsonPath,
  publicTilesetBaseUrl,
} from "./tiles";

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
