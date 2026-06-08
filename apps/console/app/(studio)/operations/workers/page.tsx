"use client"

import { WorkersTab } from "@/components/studio/operations-tabs"
import { useOperations } from "@/components/studio/operations-provider"

export default function OperationsWorkersPage() {
  const { overview, load } = useOperations()
  return <WorkersTab nodes={overview.workerNodes} onChanged={load} />
}
