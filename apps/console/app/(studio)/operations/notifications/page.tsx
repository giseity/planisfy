"use client"

import { NotificationsTab } from "@/features/operations/tabs"
import { useOperations } from "@/features/operations/provider"

export default function OperationsNotificationsPage() {
  const { overview, load } = useOperations()
  return <NotificationsTab channels={overview.notificationChannels} onChanged={load} />
}
