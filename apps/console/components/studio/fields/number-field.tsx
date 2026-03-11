"use client"

import { Label } from "@planisfy/ui/components/label"
import { Input } from "@planisfy/ui/components/input"
import { Slider } from "@planisfy/ui/components/slider"

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  showSlider?: boolean
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  showSlider = true,
}: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="h-6 w-16 text-xs text-right font-mono"
        />
      </div>
      {showSlider && (
        <Slider
          value={[value]}
          onValueChange={([v]) => { if (v !== undefined) onChange(v) }}
          min={min}
          max={max}
          step={step}
          className="w-full"
        />
      )}
    </div>
  )
}
