"use client"

import { useState } from "react"
import { Label } from "@planisfy/ui/components/label"
import { Button } from "@planisfy/ui/components/button"
import { ExpressionField } from "./expression-field"
import { VisualFilterBuilder, canParseFilter } from "./visual-filter-builder"
import { Code2, SlidersHorizontal } from "lucide-react"

interface FilterFieldProps {
  value: unknown
  onChange: (value: unknown) => void
}

export function FilterField({ value, onChange }: FilterFieldProps) {
  const canVisual = canParseFilter(value)
  const [mode, setMode] = useState<"visual" | "json">(canVisual ? "visual" : "json")

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Filter</Label>
        <div className="flex items-center gap-0.5">
          <Button
            variant={mode === "visual" ? "secondary" : "ghost"}
            size="icon"
            className="h-5 w-5"
            onClick={() => setMode("visual")}
            disabled={!canVisual}
            title="Visual editor"
          >
            <SlidersHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant={mode === "json" ? "secondary" : "ghost"}
            size="icon"
            className="h-5 w-5"
            onClick={() => setMode("json")}
            title="JSON editor"
          >
            <Code2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {mode === "visual" && canVisual ? (
        <VisualFilterBuilder value={value} onChange={onChange} />
      ) : (
        <>
          {value !== undefined ? (
            <ExpressionField label="" value={value} onChange={onChange} />
          ) : (
            <VisualFilterBuilder value={value} onChange={onChange} />
          )}
        </>
      )}
    </div>
  )
}
