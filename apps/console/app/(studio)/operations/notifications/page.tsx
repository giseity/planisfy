"use client"

import { NotificationsTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

export default function OperationsNotificationsPage() {
  const { overview, load } = useOperations()
  return <NotificationsTab channels={overview.notificationChannels} onChanged={load} />
}
