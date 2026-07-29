import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateStyleName,
  normalizeCustomStyleHandle,
  slugifyStyleName,
} from "@planisfy/database/styles/service";

test("custom style handles use the canonical public-route grammar", () => {
  assert.equal(normalizeCustomStyleHandle("  Basic-Map  "), "basic-map");
  assert.equal(normalizeCustomStyleHandle("basic@2"), null);
  assert.equal(normalizeCustomStyleHandle("basic/map"), null);
  assert.equal(normalizeCustomStyleHandle("two--dashes"), null);
  assert.equal(normalizeCustomStyleHandle(""), null);
});

test("generated handles and duplicate names respect storage limits", () => {
  assert.equal(slugifyStyleName("A Public Map"), "a-public-map");
  assert.equal(slugifyStyleName("@@@"), "");

  const duplicate = duplicateStyleName("🗺️".repeat(128));
  assert.equal(Array.from(duplicate).length, 128);
  assert.equal(duplicate.endsWith(" (copy)"), true);
});
