import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCoords,
  selectIndexedCoordinates,
  validateCoordinateList,
  validateMatrixWorkload,
} from "./directions";

test("parseCoords and validateCoordinateList reject malformed or excessive routes", () => {
  assert.deepEqual(parseCoords("0,1;2,3"), [
    { lon: 0, lat: 1 },
    { lon: 2, lat: 3 },
  ]);

  assert.equal(
    validateCoordinateList(parseCoords("0,1"), { min: 2, max: 25 }),
    "At least 2 coordinates required",
  );
  assert.equal(
    validateCoordinateList(parseCoords("bad,1;2,3"), { min: 2, max: 25 }),
    "Coordinates must be valid longitude,latitude pairs",
  );
  assert.equal(
    validateCoordinateList(
      Array.from({ length: 26 }, (_, index) => ({
        lon: index,
        lat: index,
      })),
      { min: 2, max: 25 },
    ),
    "At most 25 coordinates allowed",
  );
});

test("matrix workload validation bounds indexed coordinate selections", () => {
  const points = parseCoords("0,0;1,1;2,2;3,3");

  assert.deepEqual(selectIndexedCoordinates(points, "0;2"), [
    { lon: 0, lat: 0 },
    { lon: 2, lat: 2 },
  ]);
  assert.equal(selectIndexedCoordinates(points, "0;9"), null);

  assert.equal(
    validateMatrixWorkload(
      Array.from({ length: 10 }, () => ({ lon: 0, lat: 0 })),
      Array.from({ length: 11 }, () => ({ lon: 1, lat: 1 })),
    ),
    "At most 100 matrix cells allowed",
  );
});
