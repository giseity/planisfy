import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpriteJson,
  extractSpriteImageIds,
  spriteStorageKeys,
  styleReferencesSpriteAssets,
} from "./style-sprites";

test("sprite helpers detect referenced style icons", () => {
  const styleJson = {
    version: 8,
    sources: {},
    layers: [
      { id: "plain", type: "background" },
      {
        id: "poi",
        type: "symbol",
        layout: { "icon-image": "marker" },
      },
      {
        id: "case",
        type: "symbol",
        layout: { "icon-image": ["case", ["get", "kind"], "cafe", "park"] },
      },
    ],
  };

  assert.equal(styleReferencesSpriteAssets(styleJson), true);
  assert.deepEqual(extractSpriteImageIds(styleJson), [
    "cafe",
    "marker",
    "park",
  ]);
});

test("sprite helpers build MapLibre sprite JSON and suffix keys", () => {
  assert.deepEqual(buildSpriteJson(["marker"], 2), {
    marker: { x: 0, y: 0, width: 1, height: 1, pixelRatio: 2 },
  });
  assert.deepEqual(spriteStorageKeys("sprite-1"), {
    json: "sprites/sprite-1.json",
    png: "sprites/sprite-1.png",
    json2x: "sprites/sprite-1@2x.json",
    png2x: "sprites/sprite-1@2x.png",
  });
});
