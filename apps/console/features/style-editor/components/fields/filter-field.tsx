'use client'

import { useState } from 'react'
import { Label } from '@planisfy/ui/components/label'
import { ToggleGroup, ToggleGroupItem } from '@planisfy/ui/components/toggle-group'
import { ExpressionField } from './expression-field'
import { VisualFilterBuilder, canParseFilter } from './visual-filter-builder'
import { Code2, SlidersHorizontal } from 'lucide-react'

interface FilterFieldProps {
  value: unknown
  onChange: (value: unknown) => void
}

export function FilterField({ value, onChange }: FilterFieldProps) {
  const canVisual = canParseFilter(value)
  const [mode, setMode] = useState<'visual' | 'json'>(canVisual ? 'visual' : 'json')

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Filter</Label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value as 'visual' | 'json')
          }}
          className="rounded-md"
        >
          <ToggleGroupItem
            value="visual"
            size="icon-xs"
            className="size-6 first:rounded-l-md last:rounded-r-md [&_svg]:size-3"
            disabled={!canVisual}
            aria-label="Visual editor"
            title="Visual editor"
          >
            <SlidersHorizontal className="h-3 w-3" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="json"
            size="icon-xs"
            className="size-6 first:rounded-l-md last:rounded-r-md [&_svg]:size-3"
            aria-label="JSON editor"
            title="JSON editor"
          >
            <Code2 className="h-3 w-3" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === 'visual' && canVisual ? (
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
