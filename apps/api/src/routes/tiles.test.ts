import assert from "node:assert/strict";
import test from "node:test";
import {
  apiBaseFromUrl,
  extractVectorLayers,
  parsePublicTilesetSlug,
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
