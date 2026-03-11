"use client"

import { Label } from "@planisfy/ui/components/label"
import { Input } from "@planisfy/ui/components/input"
import { Button } from "@planisfy/ui/components/button"
import { Plus, X } from "lucide-react"

interface ArrayFieldProps {
  label: string
  value: unknown[]
  onChange: (value: unknown[]) => void
  itemType?: "number" | "string"
}

export function ArrayField({
  label,
  value,
  onChange,
  itemType = "number",
}: ArrayFieldProps) {
  const arr = Array.isArray(value) ? value : []

  const updateItem = (index: number, newVal: string) => {
    const next = [...arr]
    next[index] = itemType === "number" ? parseFloat(newVal) || 0 : newVal
    onChange(next)
  }

  const removeItem = (index: number) => {
    onChange(arr.filter((_, i) => i !== index))
  }

  const addItem = () => {
    onChange([...arr, itemType === "number" ? 0 : ""])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-col gap-1">
        {arr.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              value={String(item ?? "")}
              onChange={(e) => updateItem(i, e.target.value)}
              type={itemType === "number" ? "number" : "text"}
              className="h-6 text-xs font-mono flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={() => removeItem(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={addItem}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  )
}
