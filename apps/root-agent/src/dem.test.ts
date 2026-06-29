import assert from "node:assert/strict";
import test from "node:test";
import { hgtTileName, resolveDemTileNames } from "./index";

test("hgtTileName formats lower-left degree names", () => {
  assert.equal(hgtTileName(9, 7), "N09E007");
  assert.equal(hgtTileName(-1, -2), "S01W002");
});

test("resolveDemTileNames includes tiny sub-degree areas", () => {
  assert.deepEqual(
    resolveDemTileNames({
      bounds: { minLon: 7.1, minLat: 9.1, maxLon: 7.2, maxLat: 9.2 },
    }),
    ["N09E007"],
  );
});

test("resolveDemTileNames excludes impossible north/east edge tiles", () => {
  assert.deepEqual(
    resolveDemTileNames({
      bounds: { minLon: 179, minLat: 89, maxLon: 180, maxLat: 90 },
    }),
    ["N89E179"],
  );
});

test("resolveDemTileNames de-duplicates explicit tile overrides", () => {
  assert.deepEqual(
    resolveDemTileNames({
      hgtTiles: ["n09e007.hgt.gz", "N09E007", "bad"],
    }),
    ["N09E007"],
  );
});
