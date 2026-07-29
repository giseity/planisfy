"use client"

import { SchedulesTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsSchedulesPage() {
  const { overview, sourceImports, tilesets, load } = useOperations()
  return (
    <SchedulesTab
      schedules={overview.scheduledOperations}
      tilesets={tilesets}
      sourceImports={sourceImports}
      onChanged={load}
    />
  )
}
