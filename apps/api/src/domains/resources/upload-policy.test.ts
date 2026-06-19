import assert from "node:assert/strict";
import test from "node:test";
import {
  detectUploadFormat,
  toStorageFileName,
  unsupportedUploadFormatMessage,
} from "./upload-policy";

test("detectUploadFormat covers upload formats by extension and MIME hint", () => {
  assert.equal(detectUploadFormat("roads.geojson", ""), "geojson");
  assert.equal(detectUploadFormat("roads.csv", "text/csv"), "csv");
  assert.equal(detectUploadFormat("parcel-shapes.zip", ""), "shapefile");
  assert.equal(detectUploadFormat("basemap.pmtiles", ""), "pmtiles");
  assert.equal(detectUploadFormat("basemap.mbtiles", ""), "mbtiles");
  assert.equal(detectUploadFormat("upload", "application/geo+json"), "geojson");
  assert.equal(
    detectUploadFormat("upload", "application/vnd.pmtiles"),
    "pmtiles",
  );
  assert.equal(detectUploadFormat("notes.txt", "text/plain"), null);
});

test("toStorageFileName strips paths and unsafe characters", () => {
  assert.equal(toStorageFileName("../../roads.geojson"), "roads.geojson");
  assert.equal(
    toStorageFileName("city roads 2026.geojson"),
    "city_roads_2026.geojson",
  );
  assert.equal(toStorageFileName(".."), "upload");
  assert.equal(toStorageFileName(".env"), "upload.env");
});

test("unsupportedUploadFormatMessage names every accepted user format", () => {
  const message = unsupportedUploadFormatMessage();
  for (const label of [
    "GeoJSON",
    "CSV",
    "zipped Shapefile",
    "PMTiles",
    "MBTiles",
  ]) {
    assert.match(message, new RegExp(label));
  }
});
