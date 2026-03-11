"use client"

import { HexColorPicker, HexColorInput } from "react-colorful"
import { Popover, PopoverContent, PopoverTrigger } from "@planisfy/ui/components/popover"
import { Label } from "@planisfy/ui/components/label"
import { useState } from "react"

interface ColorFieldProps {
  label: string
  value: string
  onChange: (color: string) => void
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false)

  // Normalize rgba/named colors to hex for display
  const displayValue = value || "#000000"

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-accent">
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: displayValue }}
            />
            <span className="font-mono">{displayValue}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="end">
          <div className="flex flex-col gap-2">
            <HexColorPicker color={displayValue} onChange={onChange} />
            <HexColorInput
              color={displayValue}
              onChange={onChange}
              prefixed
              className="h-7 rounded border px-2 text-xs font-mono text-center"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
