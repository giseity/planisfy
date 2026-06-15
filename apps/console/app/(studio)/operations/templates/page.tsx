"use client"

import { TemplatesTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

export default function OperationsTemplatesPage() {
  const { overview, load } = useOperations()
  return <TemplatesTab templates={overview.workflowTemplates} onChanged={load} />
}
