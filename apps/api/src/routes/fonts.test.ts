import assert from "node:assert/strict";
import test from "node:test";
import { buildGlyphUrl, normalizeGlyphRange } from "./fonts";

test("normalizeGlyphRange accepts MapLibre glyph range formats", () => {
  assert.equal(normalizeGlyphRange("0-255"), "0-255");
  assert.equal(normalizeGlyphRange("0-255.pbf"), "0-255");
});

test("normalizeGlyphRange rejects malformed or reversed ranges", () => {
  assert.equal(normalizeGlyphRange("../0-255"), null);
  assert.equal(normalizeGlyphRange("255-0"), null);
  assert.equal(normalizeGlyphRange("0-255.pbf?x=1"), null);
});

test("buildGlyphUrl encodes path segments and rejects unsafe font stacks", () => {
  assert.equal(
    buildGlyphUrl("http://glyphs:3000/", "Noto Sans,Open Sans", "0-255"),
    "http://glyphs:3000/Noto%20Sans%2COpen%20Sans/0-255",
  );
  assert.equal(buildGlyphUrl("http://glyphs:3000", "../secret", "0-255"), null);
  assert.equal(buildGlyphUrl("http://glyphs:3000", "Noto/Sans", "0-255"), null);
  assert.equal(buildGlyphUrl("http://glyphs:3000", "Noto?x=1", "0-255"), null);
});
