"use client"

import { JobsTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

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
