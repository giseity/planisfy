"use client"

import { SchedulesTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsSchedulesPage() {
  const { executionTargets, overview, tilesets, workerProfiles, load } = useOperations()
  return (
    <SchedulesTab
      executionTargets={executionTargets}
      schedules={overview.scheduledOperations}
      tilesets={tilesets}
      workerProfiles={workerProfiles}
      onChanged={load}
    />
  )
}
