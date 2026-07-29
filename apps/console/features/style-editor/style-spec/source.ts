/**
 * Source manipulation utilities.
 */
import type { StyleSpecification, SourceSpecification } from "maplibre-gl"

export type SourceType = "vector" | "raster" | "raster-dem" | "geojson" | "image" | "video"

export const SOURCE_TYPES: SourceType[] = [
  "vector",
  "raster",
  "raster-dem",
  "geojson",
  "image",
  "video",
]

export const SOURCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

export type SourceInsertResult =
  | { ok: true; sourceId: string; style: StyleSpecification }
  | { ok: false; code: "INVALID_SOURCE_ID" | "SOURCE_EXISTS" }

export function normalizeSourceId(sourceId: string) {
  const normalized = sourceId.trim()
  return SOURCE_ID_PATTERN.test(normalized) ? normalized : null
}

export function insertSource(
  style: StyleSpecification,
  sourceId: string,
  source: SourceSpecification
): SourceInsertResult {
  const normalized = normalizeSourceId(sourceId)
  if (!normalized) return { ok: false, code: "INVALID_SOURCE_ID" }
  if (Object.hasOwn(style.sources, normalized)) {
    return { ok: false, code: "SOURCE_EXISTS" }
  }
  return {
    ok: true,
    sourceId: normalized,
    style: {
    ...style,
    sources: {
      ...style.sources,
        [normalized]: source,
      },
    },
  }
}

export function deleteSource(
  style: StyleSpecification,
  sourceId: string
): StyleSpecification {
  const rest = { ...style.sources }
  delete rest[sourceId]
  return {
    ...style,
    sources: rest,
  }
}

export function getSourceLayerIds(
  style: StyleSpecification,
  sourceId: string
): string[] {
  return style.layers
    .filter((l) => "source" in l && l.source === sourceId)
    .map((l) => l.id)
}
