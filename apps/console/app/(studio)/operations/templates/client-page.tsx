"use client"

import { TemplatesTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsTemplatesPage() {
  const { overview, load } = useOperations()
  return <TemplatesTab templates={overview.workflowTemplates} onChanged={load} />
}
