import assert from "node:assert/strict";
import test from "node:test";
import {
  getToolchainCapabilities,
  parseToolVersion,
  summarizeToolchainCapabilities,
} from "./toolchain";

test("parseToolVersion extracts known geodata tool versions", () => {
  assert.equal(parseToolVersion("duckdb", "v1.1.3 19864453f7"), "1.1.3");
  assert.equal(parseToolVersion("tippecanoe", "tippecanoe v1.36.0"), "1.36.0");
  assert.equal(
    parseToolVersion("ogr2ogr", "GDAL 3.6.2, released 2023/01/02"),
    "3.6.2",
  );
});

test("getToolchainCapabilities reports present and missing tools", async () => {
  const capabilities = await getToolchainCapabilities(
    {
      duckdbPath: "duckdb",
      tippecanoePath: "tippecanoe",
      ogr2ogrPath: "ogr2ogr",
    },
    async (file) => {
      if (file === "tippecanoe") {
        throw Object.assign(new Error("spawn tippecanoe ENOENT"), {
          code: "ENOENT",
        });
      }
      if (file === "duckdb") return { stdout: "v1.1.3\n", stderr: "" };
      return { stdout: "GDAL 3.6.2, released 2023/01/02\n", stderr: "" };
    },
  );

  assert.equal(capabilities.duckdb.available, true);
  assert.equal(capabilities.duckdb.version, "1.1.3");
  assert.equal(capabilities.tippecanoe.available, false);
  assert.match(capabilities.tippecanoe.error ?? "", /ENOENT/);
  assert.equal(capabilities.ogr2ogr.version, "3.6.2");
  assert.equal(
    summarizeToolchainCapabilities(capabilities),
    "duckdb=1.1.3, tippecanoe=missing, ogr2ogr=3.6.2",
  );
});
