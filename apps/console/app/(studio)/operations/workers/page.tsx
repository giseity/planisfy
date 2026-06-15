"use client"

import { WorkersTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

export default function OperationsWorkersPage() {
  const { overview, load } = useOperations()
  return <WorkersTab nodes={overview.workerNodes} onChanged={load} />
}
