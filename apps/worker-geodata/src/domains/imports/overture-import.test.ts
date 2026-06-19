import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOvertureImportPlan,
  buildOvertureSourceUrl,
  parseOvertureImportInput,
} from "./overture-import";

const input = {
  provider: "OVERTURE" as const,
  datasetId: "dataset-1",
  regionId: "region-1",
  bbox: [7, 48, 10, 50] as [number, number, number, number],
  theme: "places",
  type: "place",
};

test("buildOvertureSourceUrl fills the configured release/theme/type template", () => {
  assert.equal(
    buildOvertureSourceUrl({
      template:
        "s3://overturemaps-us-west-2/release/{release}/theme={theme}/type={type}/*",
      release: "2025-12-17.0",
      theme: "places",
      type: "place",
    }),
    "s3://overturemaps-us-west-2/release/2025-12-17.0/theme=places/type=place/*",
  );
});

test("buildOvertureImportPlan writes bounded DuckDB extraction SQL", () => {
  const plan = buildOvertureImportPlan(
    input,
    {
      duckdbPath: "duckdb",
      release: "2025-12-17.0",
      parquetUrlTemplate:
        "s3://overturemaps-us-west-2/release/{release}/theme={theme}/type={type}/*",
      maxFeatures: 123,
      timeoutMs: 1000,
    },
    {
      outputPath: "C:\\tmp\\features.geojson",
      metadataPath: "C:\\tmp\\metadata.json",
      schemaPath: "C:\\tmp\\schema.json",
    },
  );

  assert.equal(plan.provenance.maxFeatures, 123);
  assert.match(plan.sql, /bbox\.xmin <= 10/);
  assert.match(plan.sql, /bbox\.xmax >= 7/);
  assert.match(plan.sql, /LIMIT 123/);
  assert.match(plan.sql, /TO 'C:\/tmp\/features\.geojson'/);
  assert.match(plan.sql, /FORMAT GDAL, DRIVER 'GeoJSON'/);
});

test("parseOvertureImportInput rejects metadata-only shaped payloads without bbox", () => {
  assert.throws(
    () =>
      parseOvertureImportInput({
        provider: "OVERTURE",
        datasetId: "dataset-1",
        regionId: "region-1",
        theme: "places",
      }),
    /requires bbox/,
  );
});

test("buildOvertureSourceUrl requires type when the template asks for it", () => {
  assert.throws(
    () =>
      buildOvertureSourceUrl({
        template: "s3://bucket/release/{release}/theme={theme}/type={type}/*",
        release: "2025-12-17.0",
        theme: "places",
      }),
    /type is required/,
  );
});
