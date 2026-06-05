"use client"

import { Label } from "@planisfy/ui/components/label"
import { useState, useEffect } from "react"

interface ExpressionFieldProps {
  label: string
  value: unknown
  onChange: (value: unknown) => void
}

/**
 * JSON expression editor — a textarea that parses JSON on blur.
 * Phase 2: plain text editor. Phase 3 will add visual expression builder.
 */
export function ExpressionField({ label, value, onChange }: ExpressionFieldProps) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(value, null, 2))
  }, [value])

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text)
      setError(null)
      onChange(parsed)
    } catch {
      setError("Invalid JSON")
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
        className="h-24 w-full resize-y rounded border bg-background px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
