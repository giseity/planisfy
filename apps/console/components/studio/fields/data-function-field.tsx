"use client"

import { Label } from "@planisfy/ui/components/label"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import { Plus, X, ChevronsUpDown } from "lucide-react"
import type { PropertySpec } from "@/lib/style-spec"
import { ColorField } from "./color-field"

interface DataFunction {
  property: string
  type?: "identity" | "categorical" | "interval" | "exponential"
  base?: number
  default?: unknown
  stops?: [unknown, unknown][]
}

interface DataFunctionFieldProps {
  label: string
  value: DataFunction
  spec: PropertySpec
  onChange: (value: unknown) => void
  onSimplify: () => void
}

const FUNCTION_TYPES = ["identity", "categorical", "interval", "exponential"] as const

/**
 * Visual editor for data-driven (feature property) styling.
 */
export function DataFunctionField({
  label,
  value,
  spec,
  onChange,
  onSimplify,
}: DataFunctionFieldProps) {
  const stops = value.stops ?? []

  const update = (patch: Partial<DataFunction>) => {
    onChange({ ...value, ...patch })
  }

  const updateStop = (index: number, field: 0 | 1, newVal: unknown) => {
    const newStops = stops.map((s, i) => {
      if (i !== index) return s
      const copy = [...s] as [unknown, unknown]
      copy[field] = newVal
      return copy
    })
    update({ stops: newStops })
  }

  const addStop = () => {
    const lastValue = stops.length > 0 ? stops[stops.length - 1]![1] : getDefault(spec)
    update({ stops: [...stops, ["value", lastValue]] })
  }

  const removeStop = (index: number) => {
    update({ stops: stops.filter((_, i) => i !== index) })
  }

  return (
    <div className="flex flex-col gap-2 rounded border bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">data fn</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4"
            onClick={onSimplify}
            title="Convert to simple value"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Property name */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14">property</span>
        <Input
          value={value.property ?? ""}
          onChange={(e) => update({ property: e.target.value })}
          className="h-5 flex-1 text-[10px] font-mono"
          placeholder="feature property"
        />
      </div>

      {/* Function type */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14">type</span>
        <Select
          value={value.type ?? "categorical"}
          onValueChange={(v) => update({ type: v as DataFunction["type"] })}
        >
          <SelectTrigger className="h-5 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-[10px]">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Default value */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14">default</span>
        <StopValueInput
          value={value.default}
          spec={spec}
          onChange={(v) => update({ default: v })}
        />
      </div>

      {/* Stops (not for identity) */}
      {value.type !== "identity" && (
        <>
          <div className="text-[10px] text-muted-foreground font-medium mt-1">Stops</div>
          {stops.map((stop, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={String(stop[0] ?? "")}
                onChange={(e) => updateStop(i, 0, e.target.value)}
                className="h-5 w-16 text-[10px] font-mono"
                placeholder="key"
              />
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
              <StopValueInput
                value={stop[1]}
                spec={spec}
                onChange={(v) => updateStop(i, 1, v)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 shrink-0"
                onClick={() => removeStop(i)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-5 text-[10px] gap-1"
            onClick={addStop}
          >
            <Plus className="h-2.5 w-2.5" /> Add stop
          </Button>
        </>
      )}
    </div>
  )
}

function StopValueInput({
  value,
  spec,
  onChange,
}: {
  value: unknown
  spec: PropertySpec
  onChange: (v: unknown) => void
}) {
  if (spec.type === "color") {
    return (
      <ColorField
        label=""
        value={typeof value === "string" ? value : "#000000"}
        onChange={onChange}
      />
    )
  }
  return (
    <Input
      type={spec.type === "number" ? "number" : "text"}
      value={String(value ?? "")}
      onChange={(e) =>
        onChange(spec.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)
      }
      className="h-5 flex-1 text-[10px] font-mono"
    />
  )
}

function getDefault(spec: PropertySpec): unknown {
  if (spec.default !== undefined) return spec.default
  switch (spec.type) {
    case "color": return "#000000"
    case "number": return 0
    default: return ""
  }
}

export function valueToDataFunction(value: unknown, spec: PropertySpec): DataFunction {
  return {
    property: "",
    type: "categorical",
    default: value ?? getDefault(spec),
    stops: [],
  }
}
