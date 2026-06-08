"use client"

import { NotificationsTab } from "@/components/studio/operations-tabs"
import { useOperations } from "@/components/studio/operations-provider"

export default function OperationsNotificationsPage() {
  const { overview, load } = useOperations()
  return <NotificationsTab channels={overview.notificationChannels} onChanged={load} />
}
