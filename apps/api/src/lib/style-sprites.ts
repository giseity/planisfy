import { createHash } from "node:crypto";
import { StoragePaths } from "@planisfy/storage-paths";

export type SpriteVariant = "json" | "png" | "json2x" | "png2x";

export interface PublishedSpriteMetadata {
  id: string;
  imageIds: string[];
  storageObjects: Record<SpriteVariant, string>;
  storageKeys: Record<SpriteVariant, string>;
}

export const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

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
    if (!isRecord(layer) || !isRecord(layer.layout)) continue;
    collectIconImageIds(layer.layout["icon-image"], ids);
  }
  return [...ids].sort();
}

export function buildSpriteJson(imageIds: string[], pixelRatio: 1 | 2) {
  return Object.fromEntries(
    imageIds.map((id) => [id, { x: 0, y: 0, width: 1, height: 1, pixelRatio }]),
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

function collectIconImageIds(value: unknown, ids: Set<string>) {
  if (typeof value === "string" && value.length > 0) {
    ids.add(value);
    return;
  }
  if (!Array.isArray(value)) return;
  const op = value[0];
  if (op === "image") {
    collectIconImageIds(value[1], ids);
    return;
  }
  if (op === "coalesce") {
    for (const item of value.slice(1)) collectIconImageIds(item, ids);
    return;
  }
  if (op === "case") {
    for (let index = 2; index < value.length - 1; index += 2) {
      collectIconImageIds(value[index], ids);
    }
    collectIconImageIds(value[value.length - 1], ids);
    return;
  }
  if (op === "match") {
    for (let index = 2; index < value.length - 1; index += 2) {
      collectIconImageIds(value[index], ids);
    }
    collectIconImageIds(value[value.length - 1], ids);
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
