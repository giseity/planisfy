"use client";

import { Label } from "@planisfy/ui/components/label";
import { Input } from "@planisfy/ui/components/input";

interface StringFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function StringField({
  label,
  value,
  onChange,
  placeholder,
}: StringFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </div>
  );
}
