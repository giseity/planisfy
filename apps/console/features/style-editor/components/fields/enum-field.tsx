'use client'

import { Label } from '@planisfy/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'

interface EnumFieldProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

export function EnumField({ label, value, options, onChange }: EnumFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="!h-6 w-36 rounded-md py-0 pl-2 pr-1 text-xs [&_svg]:size-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt} className="!min-h-6 py-0.5 text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
