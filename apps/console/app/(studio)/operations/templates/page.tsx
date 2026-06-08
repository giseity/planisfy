"use client"

import { TemplatesTab } from "@/components/studio/operations-tabs"
import { useOperations } from "@/components/studio/operations-provider"

export default function OperationsTemplatesPage() {
  const { overview, load } = useOperations()
  return <TemplatesTab templates={overview.workflowTemplates} onChanged={load} />
}
