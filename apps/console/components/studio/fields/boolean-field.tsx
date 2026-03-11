"use client"

import { Label } from "@planisfy/ui/components/label"

interface BooleanFieldProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}

export function BooleanField({ label, value, onChange }: BooleanFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <button
        onClick={() => onChange(!value)}
        className={`h-5 w-9 rounded-full transition-colors ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <div
          className={`h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}
