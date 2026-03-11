"use client"

import { Label } from "@planisfy/ui/components/label"
import { ExpressionField } from "./expression-field"

interface FilterFieldProps {
  value: unknown
  onChange: (value: unknown) => void
}

/**
 * Filter editor — wraps ExpressionField for layer filters.
 * Phase 2: JSON-based. Phase 3 will add visual filter builder.
 */
export function FilterField({ value, onChange }: FilterFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">Filter</Label>
      {value !== undefined ? (
        <ExpressionField label="" value={value} onChange={onChange} />
      ) : (
        <p className="text-xs text-muted-foreground italic">No filter set</p>
      )}
    </div>
  )
}
