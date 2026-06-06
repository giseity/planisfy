import assert from "node:assert/strict";
import test from "node:test";
import { UnsupportedOvertureTypeError } from "./overture-catalog";
import { parseOvertureImportRequest } from "./source-import-requests";

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
