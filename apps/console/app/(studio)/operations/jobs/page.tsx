"use client"

import { JobsTab } from "@/components/studio/operations-tabs"
import { useOperations } from "@/components/studio/operations-provider"

export default function OperationsJobsPage() {
  const { overview, timeline, openTimeline } = useOperations()
  return <JobsTab jobs={overview.recentJobs} timeline={timeline} onTimeline={openTimeline} />
}
