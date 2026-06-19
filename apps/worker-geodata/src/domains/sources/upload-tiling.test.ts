import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTippecanoeArgs,
  missingTippecanoeMessage,
  shouldStoreRawFallback,
  validateUpload,
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

test("validateUpload summarizes GeoJSON bounds and properties", () => {
  const validation = validateUpload(
    Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Depot", capacity: 12 },
            geometry: { type: "Point", coordinates: [9.1, 48.7] },
          },
          {
            type: "Feature",
            properties: { name: "Hub", active: true },
            geometry: { type: "Point", coordinates: [9.3, 48.9] },
          },
        ],
      }),
    ),
    "geojson",
  );

  assert.equal(validation.featureCount, 2);
  assert.deepEqual(validation.bounds, [9.1, 48.7, 9.3, 48.9]);
  assert.deepEqual(validation.schema?.fields, {
    active: "boolean",
    capacity: "number",
    name: "string",
  });
});

test("validateUpload rejects GeoJSON without usable coordinates", () => {
  assert.throws(
    () =>
      validateUpload(
        Buffer.from(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: null,
              },
            ],
          }),
        ),
        "geojson",
      ),
    /no valid coordinates/,
  );
});

test("validateUpload infers CSV coordinate columns and bounds", () => {
  const validation = validateUpload(
    Buffer.from("name,lat,lng\nDepot,48.7,9.1\nHub,48.9,9.3\n"),
    "csv",
  );

  assert.equal(validation.featureCount, 2);
  assert.deepEqual(validation.csv, { latitude: "lat", longitude: "lng" });
  assert.deepEqual(validation.bounds, [9.1, 48.7, 9.3, 48.9]);
  assert.deepEqual(validation.schema?.columns, ["name", "lat", "lng"]);
});

test("validateUpload verifies explicit CSV coordinate columns", () => {
  assert.throws(
    () =>
      validateUpload(
        Buffer.from("name,lat,lng\nDepot,48.7,9.1\n"),
        "csv",
        { latitude: "latitude", longitude: "lng" },
      ),
    /latitude column 'latitude' was not found/,
  );
});

test("validateUpload rejects CSV coordinates outside WGS84 bounds", () => {
  assert.throws(
    () => validateUpload(Buffer.from("name,lat,lon\nDepot,95,9.1\n"), "csv"),
    /outside WGS84/,
  );
});

test("validateUpload smoke covers every advertised upload format", () => {
  const geojson = validateUpload(
    Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Depot" },
            geometry: { type: "Point", coordinates: [9.1, 48.7] },
          },
        ],
      }),
    ),
    "geojson",
  );
  const csv = validateUpload(
    Buffer.from("name,lat,lon\nDepot,48.7,9.1\n"),
    "csv",
  );
  const shapefile = validateUpload(
    Buffer.from("PK\x03\x04fixture"),
    "shapefile",
  );
  const pmtiles = validateUpload(
    Buffer.from("PMTiles fixture bytes"),
    "pmtiles",
  );
  const mbtiles = validateUpload(
    Buffer.from("SQLite format 3\0fixture bytes"),
    "mbtiles",
  );

  assert.equal(geojson.format, "geojson");
  assert.equal(geojson.featureCount, 1);
  assert.equal(csv.format, "csv");
  assert.deepEqual(csv.csv, { latitude: "lat", longitude: "lon" });
  assert.equal(shapefile.format, "shapefile");
  assert.equal(pmtiles.format, "pmtiles");
  assert.equal(mbtiles.format, "mbtiles");
});

test("validateUpload checks PMTiles and MBTiles magic headers", () => {
  assert.equal(
    validateUpload(Buffer.from("PMTiles fixture bytes"), "pmtiles").format,
    "pmtiles",
  );
  assert.equal(
    validateUpload(Buffer.from("SQLite format 3\0fixture bytes"), "mbtiles")
      .format,
    "mbtiles",
  );
  assert.throws(
    () => validateUpload(Buffer.from("not really pmtiles"), "pmtiles"),
    /PMTiles magic header/,
  );
  assert.throws(
    () => validateUpload(Buffer.from("not really mbtiles"), "mbtiles"),
    /SQLite database/,
  );
});

test("validateUpload rejects shapefile uploads that are not zip archives", () => {
  assert.throws(
    () =>
      validateUpload(Buffer.from("not really a zipped shapefile"), "shapefile"),
    /zipped Shapefile archive/,
  );
});
