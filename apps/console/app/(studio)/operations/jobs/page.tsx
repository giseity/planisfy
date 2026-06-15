"use client"

import { JobsTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

export default function OperationsJobsPage() {
  const { overview, timeline, openTimeline } = useOperations()
  return <JobsTab jobs={overview.recentJobs} timeline={timeline} onTimeline={openTimeline} />
}
