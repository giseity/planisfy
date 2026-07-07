"use client"

import { WorkersTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsWorkersPage() {
  const { overview, load } = useOperations()
  return <WorkersTab nodes={overview.workerNodes} onChanged={load} />
}
