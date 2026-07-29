import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import {
  buildSpriteSheet,
  buildSpriteJson,
  extractSpriteImageIds,
  normalizeSpriteAssetUpload,
  planSpriteSheet,
  readPngDimensions,
  SpriteAssetValidationError,
  spriteStorageKeys,
  styleReferencesSpriteAssets,
  validateSpritePngUpload,
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
      {
        id: "pattern",
        type: "fill",
        paint: { "fill-pattern": "hatch" },
      },
    ],
  };

  assert.equal(styleReferencesSpriteAssets(styleJson), true);
  assert.deepEqual(extractSpriteImageIds(styleJson), [
    "cafe",
    "hatch",
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

test("sprite helpers validate PNG uploads and build real sheets", () => {
  const source = new PNG({ width: 2, height: 1 });
  source.data.set([255, 0, 0, 255], 0);
  source.data.set([0, 255, 0, 255], 4);
  const buffer = PNG.sync.write(source);

  const validated = validateSpritePngUpload({
    buffer,
    contentType: "image/png",
    size: buffer.byteLength,
  });
  assert.equal(validated.width, 2);
  assert.equal(validated.height, 1);

  const sheet = buildSpriteSheet(
    [{ id: "asset-1", name: "marker", png: validated.png }],
    2,
  );
  assert.deepEqual(sheet.json.marker, {
    x: 0,
    y: 0,
    width: 4,
    height: 2,
    pixelRatio: 2,
  });

  const decoded = PNG.sync.read(sheet.png);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 2);
  assert.deepEqual([...decoded.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...decoded.data.slice(8, 12)], [0, 255, 0, 255]);
});

test("PNG dimensions are rejected from IHDR before decoding", () => {
  const source = new PNG({ width: 1, height: 1 });
  const oversizedHeader = PNG.sync.write(source);
  oversizedHeader.writeUInt32BE(513, 16);

  assert.deepEqual(readPngDimensions(PNG.sync.write(source)), {
    width: 1,
    height: 1,
  });
  assert.throws(
    () =>
      validateSpritePngUpload({
        buffer: oversizedHeader,
        contentType: "image/png",
      }),
    (err) =>
      err instanceof SpriteAssetValidationError &&
      err.code === "INVALID_SPRITE_DIMENSIONS",
  );
});

test("sprite layout wraps deterministically within bounded dimensions", () => {
  const assets = Array.from({ length: 5 }, (_, index) => ({
    id: `asset-${index}`,
    name: `icon-${index}`,
    png: new PNG({ width: 512, height: 512 }),
  }));
  const layout = planSpriteSheet(assets, 2);

  assert.equal(layout.width, 4096);
  assert.equal(layout.height, 2048);
  assert.deepEqual(
    layout.placements.map(({ x, y }) => [x, y]),
    [
      [0, 0],
      [1024, 0],
      [2048, 0],
      [3072, 0],
      [0, 1024],
    ],
  );
});

test("sprite helpers normalize safe SVG uploads into raster PNGs", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 16 12"><rect width="16" height="12" fill="#0f766e"/></svg>',
  );

  const normalized = await normalizeSpriteAssetUpload({
    buffer: svg,
    contentType: "image/svg+xml",
    fileName: "marker.svg",
    size: svg.byteLength,
  });

  assert.equal(normalized.format, "svg");
  assert.equal(normalized.contentType, "image/svg+xml");
  assert.equal(normalized.rasterContentType, "image/png");
  assert.ok(normalized.raster.width > normalized.raster.height);
  assert.ok(normalized.raster.width <= 512);
  assert.ok(normalized.raster.height <= 512);
  assert.ok(normalized.rasterBuffer.byteLength > 0);
});

test("sprite helpers reject unsafe SVG uploads", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script></svg>',
  );

  await assert.rejects(
    () =>
      normalizeSpriteAssetUpload({
        buffer: svg,
        contentType: "image/svg+xml",
        fileName: "bad.svg",
        size: svg.byteLength,
      }),
    (err) =>
      err instanceof SpriteAssetValidationError &&
      err.code === "UNSAFE_SPRITE_SVG",
  );
});
