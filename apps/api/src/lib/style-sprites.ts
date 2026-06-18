import { createHash } from "node:crypto";
import { StoragePaths } from "@planisfy/storage-paths";
import { PNG } from "pngjs";
import sharp from "sharp";

export type SpriteVariant = "json" | "png" | "json2x" | "png2x";

export const SPRITE_ASSET_MAX_BYTES = 512 * 1024;
export const SPRITE_ASSET_MAX_DIMENSION = 512;
export const SPRITE_ASSET_NAME_PATTERN = /^[A-Za-z0-9._-]{1,96}$/;
export const SPRITE_ASSET_FOLDER_PATTERN = /^[A-Za-z0-9._/ -]{0,128}$/;

export type SpriteAssetSourceFormat = "png" | "svg";

export interface PublishedSpriteMetadata {
  id: string;
  imageIds: string[];
  storageObjects: Record<SpriteVariant, string>;
  storageKeys: Record<SpriteVariant, string>;
}

export interface SpriteAssetImage {
  id: string;
  name: string;
  png: PNG;
}

export interface BuiltSpriteSheet {
  json: Record<string, SpriteJsonEntry>;
  png: Buffer;
}

export interface SpriteJsonEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: 1 | 2;
}

export interface ValidatedSpritePng {
  png: PNG;
  width: number;
  height: number;
}

export interface NormalizedSpriteUpload {
  format: SpriteAssetSourceFormat;
  sourceBuffer: Buffer;
  rasterBuffer: Buffer;
  raster: ValidatedSpritePng;
  contentType: "image/png" | "image/svg+xml";
  rasterContentType: "image/png";
}

export function styleReferencesSpriteAssets(styleJson: unknown) {
  if (!isRecord(styleJson)) return false;
  if (typeof styleJson.sprite === "string" && styleJson.sprite.length > 0) {
    return true;
  }
  return extractSpriteImageIds(styleJson).length > 0;
}

export function extractSpriteImageIds(styleJson: unknown) {
  if (!isRecord(styleJson) || !Array.isArray(styleJson.layers)) return [];
  const ids = new Set<string>();
  for (const layer of styleJson.layers) {
    if (!isRecord(layer)) continue;
    if (isRecord(layer.layout)) {
      collectSpriteImageIds(layer.layout["icon-image"], ids);
    }
    if (isRecord(layer.paint)) {
      for (const [property, value] of Object.entries(layer.paint)) {
        if (property.endsWith("-pattern")) collectSpriteImageIds(value, ids);
      }
    }
  }
  return [...ids].sort();
}

export function validateSpriteAssetName(name: string) {
  return SPRITE_ASSET_NAME_PATTERN.test(name);
}

export function validateSpriteAssetFolder(folder: string) {
  return SPRITE_ASSET_FOLDER_PATTERN.test(folder);
}

export async function normalizeSpriteAssetUpload(params: {
  buffer: Buffer;
  contentType?: string | null;
  fileName?: string | null;
  size?: number | null;
}): Promise<NormalizedSpriteUpload> {
  const contentType = normalizedSpriteContentType(
    params.contentType,
    params.fileName,
  );

  if (contentType === "image/png") {
    const raster = validateSpritePngUpload({
      buffer: params.buffer,
      contentType,
      size: params.size,
    });
    return {
      format: "png",
      sourceBuffer: params.buffer,
      rasterBuffer: params.buffer,
      raster,
      contentType,
      rasterContentType: "image/png",
    };
  }

  if (contentType === "image/svg+xml") {
    validateSvgText(params.buffer, params.size);
    const rasterBuffer = await rasterizeSvgToPng(params.buffer);
    const raster = validateSpritePngUpload({
      buffer: rasterBuffer,
      contentType: "image/png",
      size: rasterBuffer.byteLength,
    });
    return {
      format: "svg",
      sourceBuffer: params.buffer,
      rasterBuffer,
      raster,
      contentType,
      rasterContentType: "image/png",
    };
  }

  throw new SpriteAssetValidationError(
    "UNSUPPORTED_SPRITE_TYPE",
    "Sprite assets must be PNG or SVG images.",
  );
}

export function validateSpritePngUpload(params: {
  buffer: Buffer;
  contentType?: string | null;
  size?: number | null;
}): ValidatedSpritePng {
  if (params.contentType && params.contentType !== "image/png") {
    throw new SpriteAssetValidationError(
      "UNSUPPORTED_SPRITE_TYPE",
      "Sprite assets must be PNG images.",
    );
  }
  const size = params.size ?? params.buffer.byteLength;
  if (size <= 0 || size > SPRITE_ASSET_MAX_BYTES) {
    throw new SpriteAssetValidationError(
      "SPRITE_TOO_LARGE",
      `Sprite assets must be between 1 byte and ${SPRITE_ASSET_MAX_BYTES} bytes.`,
    );
  }

  let png: PNG;
  try {
    png = PNG.sync.read(params.buffer);
  } catch {
    throw new SpriteAssetValidationError(
      "INVALID_SPRITE_PNG",
      "Sprite asset must be a valid PNG image.",
    );
  }

  if (
    png.width < 1 ||
    png.height < 1 ||
    png.width > SPRITE_ASSET_MAX_DIMENSION ||
    png.height > SPRITE_ASSET_MAX_DIMENSION
  ) {
    throw new SpriteAssetValidationError(
      "INVALID_SPRITE_DIMENSIONS",
      `Sprite dimensions must be between 1 and ${SPRITE_ASSET_MAX_DIMENSION} pixels.`,
    );
  }

  return { png, width: png.width, height: png.height };
}

function normalizedSpriteContentType(
  contentType?: string | null,
  fileName?: string | null,
): "image/png" | "image/svg+xml" | null {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/svg+xml" || normalized === "application/svg+xml") {
    return "image/svg+xml";
  }
  const extension = fileName?.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "svg") return "image/svg+xml";
  return null;
}

function validateSvgText(buffer: Buffer, size?: number | null) {
  const byteLength = size ?? buffer.byteLength;
  if (byteLength <= 0 || byteLength > SPRITE_ASSET_MAX_BYTES) {
    throw new SpriteAssetValidationError(
      "SPRITE_TOO_LARGE",
      `Sprite assets must be between 1 byte and ${SPRITE_ASSET_MAX_BYTES} bytes.`,
    );
  }

  const text = buffer.toString("utf8");
  if (!/<svg[\s>]/i.test(text)) {
    throw new SpriteAssetValidationError(
      "INVALID_SPRITE_SVG",
      "Sprite asset must be a valid SVG image.",
    );
  }
  if (
    /<\s*(script|foreignObject|iframe|object|embed|image)\b/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /\b(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(text)
  ) {
    throw new SpriteAssetValidationError(
      "UNSAFE_SPRITE_SVG",
      "SVG sprite assets cannot include scripts, embedded images, event handlers, or external references.",
    );
  }
}

async function rasterizeSvgToPng(buffer: Buffer) {
  try {
    return await sharp(buffer, {
      density: 192,
      limitInputPixels:
        SPRITE_ASSET_MAX_DIMENSION * SPRITE_ASSET_MAX_DIMENSION * 4,
    })
      .resize({
        width: SPRITE_ASSET_MAX_DIMENSION,
        height: SPRITE_ASSET_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw new SpriteAssetValidationError(
      "INVALID_SPRITE_SVG",
      "Sprite asset must be a valid SVG image.",
    );
  }
}

export function buildSpriteSheet(
  assets: SpriteAssetImage[],
  pixelRatio: 1 | 2,
): BuiltSpriteSheet {
  if (assets.length === 0) {
    const empty = new PNG({ width: 1, height: 1 });
    return { json: {}, png: PNG.sync.write(empty) };
  }

  const scale = pixelRatio;
  const width = assets.reduce((sum, asset) => sum + asset.png.width * scale, 0);
  const height = Math.max(...assets.map((asset) => asset.png.height * scale));
  const sheet = new PNG({ width, height });
  const json: Record<string, SpriteJsonEntry> = {};
  let x = 0;

  for (const asset of assets) {
    const scaledWidth = asset.png.width * scale;
    const scaledHeight = asset.png.height * scale;
    blitScaled(asset.png, sheet, x, 0, scale);
    json[asset.name] = {
      x,
      y: 0,
      width: scaledWidth,
      height: scaledHeight,
      pixelRatio,
    };
    x += scaledWidth;
  }

  return { json, png: PNG.sync.write(sheet) };
}

export function buildSpriteJson(imageIds: string[], pixelRatio: 1 | 2) {
  return Object.fromEntries(
    imageIds.map((id, index) => [
      id,
      { x: index, y: 0, width: 1, height: 1, pixelRatio },
    ]),
  );
}

export function spriteStorageKeys(spriteId: string) {
  return {
    json: StoragePaths.spriteAsset(spriteId, "json"),
    png: StoragePaths.spriteAsset(spriteId, "png"),
    json2x: StoragePaths.spriteAsset(spriteId, "json", 2),
    png2x: StoragePaths.spriteAsset(spriteId, "png", 2),
  };
}

export function spriteIdForStyleVersion(
  styleId: string,
  version: number,
  imageIds: string[],
) {
  const hash = createHash("sha256")
    .update(`${styleId}:${version}:${imageIds.join(",")}`)
    .digest("hex")
    .slice(0, 16);
  return `${styleId}-${version}-${hash}`;
}

export function parsePublishedSpriteMetadata(
  metadata: unknown,
): PublishedSpriteMetadata | null {
  if (!isRecord(metadata) || !isRecord(metadata.sprite)) return null;
  const sprite = metadata.sprite;
  if (
    typeof sprite.id !== "string" ||
    !Array.isArray(sprite.imageIds) ||
    !isRecord(sprite.storageObjects) ||
    !isRecord(sprite.storageKeys)
  ) {
    return null;
  }

  const storageObjects = readVariantRecord(sprite.storageObjects);
  const storageKeys = readVariantRecord(sprite.storageKeys);
  if (!storageObjects || !storageKeys) return null;

  return {
    id: sprite.id,
    imageIds: sprite.imageIds.filter(
      (id): id is string => typeof id === "string",
    ),
    storageObjects,
    storageKeys,
  };
}

export class SpriteAssetValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpriteAssetValidationError";
  }
}

function collectSpriteImageIds(value: unknown, ids: Set<string>) {
  if (typeof value === "string" && value.length > 0) {
    ids.add(value);
    return;
  }
  if (!Array.isArray(value)) return;
  const op = value[0];
  if (op === "image" || op === "literal") {
    collectSpriteImageIds(value[1], ids);
    return;
  }
  if (op === "coalesce") {
    for (const item of value.slice(1)) collectSpriteImageIds(item, ids);
    return;
  }
  if (op === "case") {
    for (let index = 2; index < value.length - 1; index += 2) {
      collectSpriteImageIds(value[index], ids);
    }
    collectSpriteImageIds(value[value.length - 1], ids);
    return;
  }
  if (op === "match") {
    for (let index = 2; index < value.length - 1; index += 2) {
      collectSpriteImageIds(value[index], ids);
    }
    collectSpriteImageIds(value[value.length - 1], ids);
  }
}

function blitScaled(
  source: PNG,
  target: PNG,
  offsetX: number,
  offsetY: number,
  scale: 1 | 2,
) {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const sourceIndex = (source.width * sourceY + sourceX) << 2;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const targetX = offsetX + sourceX * scale + dx;
          const targetY = offsetY + sourceY * scale + dy;
          const targetIndex = (target.width * targetY + targetX) << 2;
          target.data[targetIndex] = source.data[sourceIndex] ?? 0;
          target.data[targetIndex + 1] = source.data[sourceIndex + 1] ?? 0;
          target.data[targetIndex + 2] = source.data[sourceIndex + 2] ?? 0;
          target.data[targetIndex + 3] = source.data[sourceIndex + 3] ?? 0;
        }
      }
    }
  }
}

function readVariantRecord(value: Record<string, unknown>) {
  const json = value.json;
  const png = value.png;
  const json2x = value.json2x;
  const png2x = value.png2x;
  if (
    typeof json !== "string" ||
    typeof png !== "string" ||
    typeof json2x !== "string" ||
    typeof png2x !== "string"
  ) {
    return null;
  }
  return { json, png, json2x, png2x };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
