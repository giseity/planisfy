"use client"

import { SchedulesTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

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
