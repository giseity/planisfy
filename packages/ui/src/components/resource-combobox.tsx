"use client"

import * as React from "react"
import { Combobox, type ComboboxOption } from "@planisfy/ui/components/combobox"

function ResourceCombobox({
  resources,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
}: {
  resources: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}) {
  return (
    <Combobox
      value={value}
      options={resources}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
    />
  )
}

export { ResourceCombobox }
