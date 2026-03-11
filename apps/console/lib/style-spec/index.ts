/**
 * Style spec utilities — ported from Maputnik, adapted for our Zustand store.
 * Wraps @maplibre/maplibre-gl-style-spec for spec lookups and validation.
 */
import {
  latest as v8Spec,
  validate as validateStyle,
  derefLayers,
} from "@maplibre/maplibre-gl-style-spec"
import type { StyleSpecification, LayerSpecification } from "maplibre-gl"

export { v8Spec, validateStyle, derefLayers }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpecFieldType =
  | "number"
  | "enum"
  | "string"
  | "color"
  | "boolean"
  | "array"
  | "resolvedImage"
  | "formatted"
  | "padding"

export interface PropertySpec {
  type: SpecFieldType
  default?: unknown
  minimum?: number
  maximum?: number
  values?: Record<string, unknown> | string[]
  length?: number
  value?: string // inner type for arrays (e.g. "number")
  transition?: boolean
  requires?: unknown[]
  expression?: {
    interpolated: boolean
    parameters: string[]
  }
  "property-type"?: string
}

export type LayerType = LayerSpecification["type"]

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const TYPE_DEFAULTS: Record<string, unknown> = {
  color: "#000000",
  string: "",
  boolean: false,
  number: 0,
  array: [],
  enum: undefined,
  resolvedImage: "",
  formatted: "",
  padding: [0, 0, 0, 0],
}

export function getDefaultValue(spec: PropertySpec): unknown {
  if (spec.default !== undefined) return spec.default
  if (spec.type === "enum" && spec.values) {
    const keys = Array.isArray(spec.values)
      ? spec.values
      : Object.keys(spec.values)
    return keys[0]
  }
  return TYPE_DEFAULTS[spec.type] ?? ""
}

// ---------------------------------------------------------------------------
// Spec lookups
// ---------------------------------------------------------------------------

export function getPaintSpec(layerType: string): Record<string, PropertySpec> {
  return (v8Spec as any)[`paint_${layerType}`] ?? {}
}

export function getLayoutSpec(layerType: string): Record<string, PropertySpec> {
  return (v8Spec as any)[`layout_${layerType}`] ?? {}
}

export function getPropertySpec(
  layerType: string,
  group: "paint" | "layout",
  property: string
): PropertySpec | undefined {
  const specs = group === "paint" ? getPaintSpec(layerType) : getLayoutSpec(layerType)
  return specs[property]
}

/** Get all property names for a layer type, grouped by paint/layout. */
export function getLayerProperties(layerType: string) {
  return {
    paint: Object.keys(getPaintSpec(layerType)),
    layout: Object.keys(getLayoutSpec(layerType)).filter((k) => k !== "visibility"),
  }
}

/** All layer types defined in the spec */
export const LAYER_TYPES: LayerType[] = [
  "background",
  "fill",
  "line",
  "symbol",
  "raster",
  "circle",
  "fill-extrusion",
  "heatmap",
  "hillshade",
]

/** Layer types that don't require a source */
export const SOURCE_FREE_LAYER_TYPES: LayerType[] = ["background"]

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface StyleError {
  message: string
  line?: number
  layer?: string
  property?: string
}

export function validateStyleJSON(style: StyleSpecification): StyleError[] {
  try {
    // Deep-clone to strip any Proxy objects (e.g. from immer)
    const clean = JSON.parse(JSON.stringify(style))
    const errors = validateStyle(clean as any)
    return errors.map((e: any) => ({
      message: e.message,
      line: e.line,
    }))
  } catch {
    return [{ message: "Invalid style JSON" }]
  }
}

// ---------------------------------------------------------------------------
// Expression detection
// ---------------------------------------------------------------------------

export function isExpression(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "string"
}

export function isZoomFunction(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "stops" in value &&
    !("property" in value)
  )
}

export function isDataFunction(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "stops" in value &&
    "property" in value
  )
}

export function getValueType(
  value: unknown
): "value" | "expression" | "zoom_function" | "data_function" {
  if (value === undefined || value === null) return "value"
  if (isZoomFunction(value)) return "zoom_function"
  if (isDataFunction(value)) return "data_function"
  if (isExpression(value)) return "expression"
  return "value"
}
