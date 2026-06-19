"use client"

import { JobsTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsJobsPage() {
  const { overview, timeline, openTimeline, reconcileStaleJobs } =
    useOperations()
  return (
    <JobsTab
      jobs={overview.recentJobs}
      staleJobReconciliation={overview.staleJobReconciliation}
      timeline={timeline}
      onTimeline={openTimeline}
      onReconcileStale={reconcileStaleJobs}
    />
  )
}
