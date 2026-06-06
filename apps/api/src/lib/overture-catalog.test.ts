import assert from "node:assert/strict";
import test from "node:test";
import {
  OVERTURE_CATALOG,
  UnsupportedOvertureTypeError,
  findOvertureType,
  overtureCatalogResponse,
  validateOvertureThemeType,
} from "./overture-catalog";

test("OVERTURE_CATALOG exposes the current theme vocabulary", () => {
  assert.deepEqual(
    OVERTURE_CATALOG.map((entry) => entry.theme),
    ["addresses", "base", "buildings", "divisions", "places", "transportation"],
  );
  assert.deepEqual(
    OVERTURE_CATALOG.find((entry) => entry.theme === "transportation")?.types.map(
      (entry) => entry.type,
    ),
    ["segment", "connector"],
  );
});

test("validateOvertureThemeType accepts known pairs", () => {
  const entry = validateOvertureThemeType({
    theme: "places",
    type: "place",
  });

  assert.equal(entry?.defaultLayerId, "place");
  assert.deepEqual(entry?.geometry, ["Point"]);
});

test("validateOvertureThemeType rejects unknown pairs by default", () => {
  assert.throws(
    () =>
      validateOvertureThemeType({
        theme: "places",
        type: "building",
      }),
    UnsupportedOvertureTypeError,
  );
});

test("validateOvertureThemeType requires type unless experimental mode is explicit", () => {
  assert.throws(
    () => validateOvertureThemeType({ theme: "places" }),
    /requires an explicit feature type/,
  );
  assert.equal(
    validateOvertureThemeType({
      theme: "future-theme",
      type: "future-type",
      allowExperimental: true,
    }),
    null,
  );
});

test("findOvertureType and response preserve labels for Console pickers", () => {
  assert.equal(findOvertureType("buildings", "building")?.label, "Building");
  assert.equal(
    overtureCatalogResponse().data.themes.find(
      (entry) => entry.theme === "addresses",
    )?.label,
    "Addresses",
  );
});
