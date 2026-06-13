import assert from "node:assert/strict";
import test from "node:test";
import { UnsupportedOvertureTypeError } from "./overture-catalog";
import {
  assertOvertureReleaseConfigured,
  parseOvertureImportRequest,
} from "./source-import-requests";

const baseRequest = {
  handle: "city-places",
  name: "City places",
  regionId: "00000000-0000-4000-8000-000000000001",
  theme: "places",
  type: "place",
};

test("parseOvertureImportRequest accepts cataloged theme/type pairs", () => {
  const parsed = parseOvertureImportRequest(baseRequest);

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.theme, "places");
  assert.equal(parsed.catalogEntry?.defaultLayerId, "place");
});

test("parseOvertureImportRequest rejects unsupported pairs before route side effects", () => {
  const parsed = parseOvertureImportRequest({
    ...baseRequest,
    theme: "places",
    type: "building",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(parsed.error instanceof UnsupportedOvertureTypeError);
  assert.equal("reason" in parsed && parsed.reason, "unsupported-overture-type");
});

test("parseOvertureImportRequest keeps experimental custom pairs opt-in", () => {
  const strict = parseOvertureImportRequest({
    ...baseRequest,
    theme: "future",
    type: "feature",
  });
  assert.equal(strict.success, false);

  const experimental = parseOvertureImportRequest(
    {
      ...baseRequest,
      theme: "future",
      type: "feature",
    },
    { allowExperimental: true },
  );
  assert.equal(experimental.success, true);
  if (!experimental.success) return;
  assert.equal(experimental.catalogEntry, null);
});

test("assertOvertureReleaseConfigured trims configured releases", () => {
  const result = assertOvertureReleaseConfigured("  2026-01-14.0  ");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.release, "2026-01-14.0");
});

test("assertOvertureReleaseConfigured rejects missing releases before queueing", () => {
  for (const release of [undefined, null, "", "   "]) {
    const result = assertOvertureReleaseConfigured(release);

    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, "OVERTURE_RELEASE_NOT_CONFIGURED");
    assert.match(result.message, /OVERTURE_RELEASE/);
  }
});
