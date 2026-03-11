/**
 * Layer manipulation utilities — ported from Maputnik.
 */
import type { LayerSpecification } from "maplibre-gl"
import { getPaintSpec, getLayoutSpec } from "./index"

/**
 * Change a layer's type while preserving compatible paint/layout properties.
 */
export function changeLayerType(
  layer: LayerSpecification,
  newType: LayerSpecification["type"]
): LayerSpecification {
  const newPaintKeys = new Set(Object.keys(getPaintSpec(newType)))
  const newLayoutKeys = new Set(Object.keys(getLayoutSpec(newType)))

  const newLayer: any = {
    id: layer.id,
    type: newType,
  }

  // Preserve source/source-layer if present
  if ("source" in layer && layer.source) newLayer.source = layer.source
  if ("source-layer" in layer && (layer as any)["source-layer"]) {
    newLayer["source-layer"] = (layer as any)["source-layer"]
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
