import assert from "node:assert/strict";
import test from "node:test";
import { buildOvertureImportEstimate, coerceBBox } from "./import-estimates";

test("buildOvertureImportEstimate flags small regions as low risk", () => {
  const estimate = buildOvertureImportEstimate({
    bbox: [9.1, 48.7, 9.3, 48.9],
    maxFeatures: 50_000,
    timeoutMs: 900_000,
  });

  assert.equal(estimate.riskLevel, "low");
  assert.equal(estimate.safeguards.requiresCancellationCheckpoints, false);
  assert.equal(estimate.warnings.length, 0);
  assert.ok(estimate.approximateAreaKm2 > 0);
});

test("buildOvertureImportEstimate warns for large imports", () => {
  const estimate = buildOvertureImportEstimate({
    bbox: [-125, 24, -66, 49],
    maxFeatures: 50_000,
    timeoutMs: 900_000,
  });

  assert.equal(estimate.riskLevel, "high");
  assert.equal(estimate.safeguards.requiresCancellationCheckpoints, true);
  assert.match(estimate.warnings.join("\n"), /Large region import/);
});

test("coerceBBox rejects invalid saved region bounds", () => {
  assert.throws(() => coerceBBox([10, 20, 1, 30]), /valid WGS84 bounds/);
  assert.throws(() => coerceBBox([1, 2, 3]), /must be/);
});
