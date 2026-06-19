/**
 * Layer manipulation utilities — ported from Maputnik.
 */
import type { LayerSpecification } from "maplibre-gl"
import { getPaintSpec, getLayoutSpec } from "./index"

type MutableLayer = LayerSpecification & {
  [key: string]: unknown
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
  source?: string
  "source-layer"?: string
  filter?: unknown
  minzoom?: number
  maxzoom?: number
}

/**
 * Change a layer's type while preserving compatible paint/layout properties.
 */
export function changeLayerType(
  layer: LayerSpecification,
  newType: LayerSpecification["type"]
): LayerSpecification {
  const newPaintKeys = new Set(Object.keys(getPaintSpec(newType)))
  const newLayoutKeys = new Set(Object.keys(getLayoutSpec(newType)))

  const sourceLayer = (layer as MutableLayer)["source-layer"]
  const newLayer: MutableLayer = {
    id: layer.id,
    type: newType,
  } as MutableLayer

  // Preserve source/source-layer if present
  if ("source" in layer && layer.source) newLayer.source = layer.source
  if (sourceLayer) {
    newLayer["source-layer"] = sourceLayer
  }
  if ("filter" in layer && layer.filter) newLayer.filter = layer.filter
  if ("minzoom" in layer) newLayer.minzoom = layer.minzoom
  if ("maxzoom" in layer) newLayer.maxzoom = layer.maxzoom

  // Keep compatible paint properties
  if ("paint" in layer && layer.paint) {
    const paint: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(layer.paint as Record<string, unknown>)) {
      if (newPaintKeys.has(key)) paint[key] = val
    }
    if (Object.keys(paint).length > 0) newLayer.paint = paint
  }

  // Keep compatible layout properties
  if ("layout" in layer && layer.layout) {
    const layout: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(layer.layout as Record<string, unknown>)) {
      if (newLayoutKeys.has(key)) layout[key] = val
    }
    if (Object.keys(layout).length > 0) newLayer.layout = layout
  }

  return newLayer as LayerSpecification
}

/**
 * Extract a prefix from a layer ID (everything before the first dash).
 */
export function layerPrefix(id: string): string {
  return id.split("-")[0] ?? id
}
