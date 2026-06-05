"use client"

import type { PropertySpec } from "@/lib/style-spec"
import { getValueType } from "@/lib/style-spec"
import { ColorField } from "./color-field"
import { NumberField } from "./number-field"
import { EnumField } from "./enum-field"
import { StringField } from "./string-field"
import { BooleanField } from "./boolean-field"
import { ArrayField } from "./array-field"
import { ExpressionField } from "./expression-field"
import { ZoomFunctionField } from "./zoom-function-field"
import { DataFunctionField } from "./data-function-field"
import { IconField } from "./icon-field"
import { FontField } from "./font-field"

interface ZoomFunctionValue {
  stops: [number, unknown][]
  base?: number
}

interface DataFunctionValue {
  property: string
  type?: "identity" | "categorical" | "interval" | "exponential"
  base?: number
  default?: unknown
  stops?: [unknown, unknown][]
}

interface SpecFieldProps {
  property: string
  spec: PropertySpec
  value: unknown
  onChange: (value: unknown) => void
  spriteUrl?: string
  glyphsUrl?: string
}

/**
 * Spec-driven field adapter — routes to the correct input component
 * based on the MapLibre style spec type definition.
 */
export function SpecField({ property, spec, value, onChange, spriteUrl, glyphsUrl }: SpecFieldProps) {
  const valueType = getValueType(value)

  // Zoom function → visual stop editor
  if (valueType === "zoom_function") {
    return (
      <ZoomFunctionField
        label={property}
        value={value as ZoomFunctionValue}
        spec={spec}
        onChange={onChange}
        onSimplify={() => onChange(spec.default ?? undefined)}
      />
    )
  }

  // Data function → visual data-driven editor
  if (valueType === "data_function") {
    return (
      <DataFunctionField
        label={property}
        value={value as DataFunctionValue}
        spec={spec}
        onChange={onChange}
        onSimplify={() => onChange(spec.default ?? undefined)}
      />
    )
  }

  // Font field → font stack picker (check before expression since font arrays look like expressions)
  if (property === "text-font" && (valueType === "value" || (Array.isArray(value) && value.every((v) => typeof v === "string")))) {
    return (
      <FontField
        label={property}
        value={Array.isArray(value) ? value : (spec.default as string[]) ?? []}
        onChange={onChange}
        glyphsUrl={glyphsUrl}
      />
    )
  }

  // Icon/pattern fields → sprite picker (check before expression)
  if ((property === "icon-image" || property.endsWith("-pattern")) && valueType === "value") {
    return (
      <IconField
        label={property}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        spriteUrl={spriteUrl}
      />
    )
  }

  // Expression → JSON editor
  if (valueType === "expression") {
    return <ExpressionField label={property} value={value} onChange={onChange} />
  }

  switch (spec.type) {
    case "color":
      return (
        <ColorField
          label={property}
          value={typeof value === "string" ? value : (spec.default as string) ?? "#000000"}
          onChange={onChange}
        />
      )

    case "number":
      return (
        <NumberField
          label={property}
          value={typeof value === "number" ? value : (spec.default as number) ?? 0}
          onChange={onChange}
          min={spec.minimum ?? 0}
          max={spec.maximum ?? (property.includes("opacity") ? 1 : 100)}
          step={property.includes("opacity") ? 0.01 : property.includes("width") ? 0.5 : 1}
          showSlider={spec.maximum !== undefined || property.includes("opacity")}
        />
      )

    case "enum": {
      const options = spec.values
        ? Array.isArray(spec.values)
          ? spec.values
          : Object.keys(spec.values)
        : []
      return (
        <EnumField
          label={property}
          value={typeof value === "string" ? value : (spec.default as string) ?? options[0] ?? ""}
          options={options}
          onChange={onChange}
        />
      )
    }

    case "boolean":
      return (
        <BooleanField
          label={property}
          value={typeof value === "boolean" ? value : (spec.default as boolean) ?? false}
          onChange={onChange}
        />
      )

    case "array":
      return (
        <ArrayField
          label={property}
          value={Array.isArray(value) ? value : (spec.default as unknown[]) ?? []}
          onChange={onChange}
          itemType={spec.value === "string" ? "string" : "number"}
        />
      )

    case "string":
    case "resolvedImage":
    case "formatted":
      return (
        <StringField
          label={property}
          value={typeof value === "string" ? value : (spec.default as string) ?? ""}
          onChange={(v) => onChange(v)}
          placeholder={spec.default as string}
        />
      )

    case "padding":
      return (
        <ArrayField
          label={property}
          value={Array.isArray(value) ? value : [0, 0, 0, 0]}
          onChange={onChange}
          itemType="number"
        />
      )

    default:
      return <ExpressionField label={property} value={value} onChange={onChange} />
  }
}
