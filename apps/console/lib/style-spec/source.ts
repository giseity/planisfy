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

export function addSource(
  style: StyleSpecification,
  sourceId: string,
  source: SourceSpecification
): StyleSpecification {
  return {
    ...style,
    sources: {
      ...style.sources,
      [sourceId]: source,
    },
  }
}

export function deleteSource(
  style: StyleSpecification,
  sourceId: string
): StyleSpecification {
  const { [sourceId]: _, ...rest } = style.sources
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
