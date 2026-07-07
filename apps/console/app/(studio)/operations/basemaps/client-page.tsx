'use client'

import { BasemapsTab } from '@/features/operations/tabs'
import { useOperations } from '@/features/operations/provider'

export default function BasemapsOperationsPage() {
  const { overview, load } = useOperations()
  return (
    <BasemapsTab
      builds={overview.basemapBuilds}
      releases={overview.basemapReleases}
      runtimeInstallations={overview.runtimeInstallations}
      nodes={overview.workerNodes}
      onChanged={load}
    />
  )
}
