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

interface SpecFieldProps {
  property: string
  spec: PropertySpec
  value: unknown
  onChange: (value: unknown) => void
}

/**
 * Spec-driven field adapter — routes to the correct input component
 * based on the MapLibre style spec type definition.
 */
export function SpecField({ property, spec, value, onChange }: SpecFieldProps) {
  const valueType = getValueType(value)

  // If the value is an expression or function, show JSON editor
  if (valueType === "expression" || valueType === "zoom_function" || valueType === "data_function") {
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

    case "array": {
      // Fixed-size number arrays (e.g., translate, dasharray, padding)
      if (Array.isArray(value)) {
        return (
          <ArrayField
            label={property}
            value={value}
            onChange={onChange}
            itemType={spec.value === "string" ? "string" : "number"}
          />
        )
      }
      // Font arrays
      if (property === "text-font") {
        return (
          <ArrayField
            label={property}
            value={Array.isArray(value) ? value : (spec.default as unknown[]) ?? []}
            onChange={onChange}
            itemType="string"
          />
        )
      }
      return (
        <ArrayField
          label={property}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          itemType={spec.value === "string" ? "string" : "number"}
        />
      )
    }

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
