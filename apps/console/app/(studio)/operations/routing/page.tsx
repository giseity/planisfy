"use client"

import { RoutingTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsRoutingPage() {
  const { overview, load } = useOperations()
  return (
    <RoutingTab
      builds={overview.routingGraphBuilds}
      runtimeInstallations={overview.runtimeInstallations}
      nodes={overview.workerNodes}
      onChanged={load}
    />
  )
}
