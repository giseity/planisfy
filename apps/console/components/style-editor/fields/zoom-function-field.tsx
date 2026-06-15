"use client";

import { Label } from "@planisfy/ui/components/label";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Plus, X, ChevronsUpDown } from "lucide-react";
import type { PropertySpec } from "@/lib/style-spec";
import { ColorField } from "./color-field";

interface ZoomStop {
  zoom: number;
  value: unknown;
}

interface ZoomFunction {
  stops: [number, unknown][];
  base?: number;
}

interface ZoomFunctionFieldProps {
  label: string;
  value: ZoomFunction;
  spec: PropertySpec;
  onChange: (value: unknown) => void;
  /** Switch back to a simple literal value */
  onSimplify: () => void;
}

/**
 * Visual editor for zoom-dependent property values.
 * Renders a list of zoom stops with inputs for each.
 */
export function ZoomFunctionField({
  label,
  value,
  spec,
  onChange,
  onSimplify,
}: ZoomFunctionFieldProps) {
  const stops: ZoomStop[] = (value.stops ?? []).map(([z, v]) => ({
    zoom: z,
    value: v,
  }));

  const updateStop = (
    index: number,
    field: "zoom" | "value",
    newVal: unknown,
  ) => {
    const newStops = stops.map((s, i) => {
      if (i !== index) return s;
      return { ...s, [field]: newVal };
    });
    onChange({
      ...value,
      stops: newStops.map((s) => [s.zoom, s.value] as [number, unknown]),
    });
  };

  const addStop = () => {
    const lastZoom = stops.length > 0 ? stops[stops.length - 1]!.zoom + 2 : 0;
    const lastValue =
      stops.length > 0 ? stops[stops.length - 1]!.value : getDefault(spec);
    onChange({
      ...value,
      stops: [...(value.stops ?? []), [lastZoom, lastValue]],
    });
  };

  const removeStop = (index: number) => {
    const newStops = value.stops.filter((_, i) => i !== index);
    if (newStops.length === 0) {
      onSimplify();
    } else {
      onChange({ ...value, stops: newStops });
    }
  };

  const updateBase = (base: number) => {
    onChange({ ...value, base });
  };

  return (
    <div className="flex flex-col gap-2 rounded border bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">zoom fn</span>
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

      {/* Interpolation base */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-12">base</span>
        <Input
          type="number"
          value={value.base ?? 1}
          onChange={(e) => updateBase(parseFloat(e.target.value) || 1)}
          className="h-5 w-16 text-[10px] font-mono"
          step={0.1}
          min={0}
        />
      </div>

      {/* Stops */}
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-4">z</span>
          <Input
            type="number"
            value={stop.zoom}
            onChange={(e) =>
              updateStop(i, "zoom", parseFloat(e.target.value) || 0)
            }
            className="h-5 w-10 text-[10px] font-mono"
            min={0}
            max={24}
          />
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
          <StopValueInput
            value={stop.value}
            spec={spec}
            onChange={(v) => updateStop(i, "value", v)}
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
    </div>
  );
}

function StopValueInput({
  value,
  spec,
  onChange,
}: {
  value: unknown;
  spec: PropertySpec;
  onChange: (v: unknown) => void;
}) {
  if (spec.type === "color") {
    return (
      <ColorField
        label=""
        value={typeof value === "string" ? value : "#000000"}
        onChange={onChange}
      />
    );
  }

  return (
    <Input
      type={spec.type === "number" ? "number" : "text"}
      value={String(value ?? "")}
      onChange={(e) =>
        onChange(
          spec.type === "number"
            ? parseFloat(e.target.value) || 0
            : e.target.value,
        )
      }
      className="h-5 flex-1 text-[10px] font-mono"
    />
  );
}

function getDefault(spec: PropertySpec): unknown {
  if (spec.default !== undefined) return spec.default;
  switch (spec.type) {
    case "color":
      return "#000000";
    case "number":
      return 0;
    case "string":
      return "";
    case "boolean":
      return false;
    default:
      return 0;
  }
}

/**
 * Helper: create a zoom function from a simple value
 */
export function valueToZoomFunction(
  value: unknown,
  spec: PropertySpec,
): ZoomFunction {
  const defaultVal = value ?? getDefault(spec);
  return {
    stops: [
      [5, defaultVal],
      [15, defaultVal],
    ],
  };
}
