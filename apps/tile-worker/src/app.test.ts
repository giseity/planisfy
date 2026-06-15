import assert from "node:assert/strict";
import test from "node:test";
import { createTileWorkerApp, emptyFeatureCollection } from "./app";
import type {
  ResolvedTileset,
  TileQueryOptions,
  TileQueryResult,
  TileReadResult,
} from "@planisfy/tile-runtime";

const resolved = {
  version: { id: "version_1", format: "PMTILES" },
} as ResolvedTileset;

test("health route reports tile-worker readiness", async () => {
  const app = createTileWorkerApp();
  const response = await app.request("/health");
  const body = (await response.json()) as { ok: boolean; service: string };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "tile-worker");
});

test("tile route serves PMTiles data through shared runtime dependency", async () => {
  const app = createTileWorkerApp({
    resolveTileset: async (owner, handle) => {
      assert.equal(owner, "acme");
      assert.equal(handle, "roads");
      return resolved;
    },
    readResolvedTile: async (_resolved, coords): Promise<TileReadResult> => {
      assert.deepEqual(coords, { z: 1, x: 0, y: 1 });
      return {
        ok: true,
        data: new Uint8Array([1, 2, 3]),
        contentType: "application/vnd.mapbox-vector-tile",
        cacheControl: "public, max-age=3600",
      };
    },
  });

  const response = await app.request("/tiles/v1/acme.roads/1/0/1");

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.mapbox-vector-tile",
  );
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(
    Array.from(new Uint8Array(await response.arrayBuffer())),
    [1, 2, 3],
  );
});

test("tilequery route shares parsing and query runtime behavior", async () => {
  const app = createTileWorkerApp({
    resolveTileset: async (owner, handle, version) => {
      assert.equal(owner, "acme");
      assert.equal(handle, "roads");
      assert.equal(version, 2);
      return resolved;
    },
    queryResolvedTileset: async (
      _resolved,
      coords,
      options: TileQueryOptions,
    ): Promise<TileQueryResult> => {
      assert.deepEqual(coords, { lon: -73.9857, lat: 40.7484 });
      assert.equal(options.limit, 1);
      return {
        ok: true,
        collection: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { layer: "roads" },
              geometry: {
                type: "Point",
                coordinates: [-73.9857, 40.7484],
              },
            },
          ],
        },
        headers: { "Cache-Control": "public, max-age=300" },
      };
    },
  });

  const response = await app.request(
    "/v4/acme.roads@2/tilequery/-73.9857,40.7484.json?limit=1",
  );
  const body = (await response.json()) as ReturnType<
    typeof emptyFeatureCollection
  >;

  assert.equal(response.status, 200);
  assert.equal(body.features.length, 1);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
});
