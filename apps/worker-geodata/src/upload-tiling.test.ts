import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTippecanoeArgs,
  missingTippecanoeMessage,
  shouldStoreRawFallback,
} from "./upload-tiling";

test("buildTippecanoeArgs creates deterministic upload tiling args", () => {
  assert.deepEqual(
    buildTippecanoeArgs({
      inputPath: "/tmp/input.geojson",
      outputPath: "/tmp/output.pmtiles",
      options: {
        minZoom: 3,
        maxZoom: 12,
        dropDensest: true,
        simplification: 4,
      },
    }),
    [
      "-o",
      "/tmp/output.pmtiles",
      "-z12",
      "-Z3",
      "--force",
      "--no-tile-compression",
      "--drop-densest-as-needed",
      "--simplification=4",
      "/tmp/input.geojson",
    ],
  );
});

test("raw fallback is gated behind explicit degraded mode", () => {
  assert.equal(
    shouldStoreRawFallback({
      missingTippecanoe: true,
      allowRawFallback: false,
    }),
    false,
  );
  assert.equal(
    shouldStoreRawFallback({
      missingTippecanoe: true,
      allowRawFallback: true,
    }),
    true,
  );
  assert.equal(
    shouldStoreRawFallback({
      missingTippecanoe: false,
      allowRawFallback: true,
    }),
    false,
  );
});

test("missing Tippecanoe message points to env configuration", () => {
  assert.match(
    missingTippecanoeMessage("/usr/local/bin/tippecanoe"),
    /TIPPECANOE_PATH/,
  );
  assert.match(
    missingTippecanoeMessage("/usr/local/bin/tippecanoe"),
    /GEODATA_ALLOW_RAW_FALLBACK=true/,
  );
});
