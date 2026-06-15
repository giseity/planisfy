"use client"

import { DeliveryTab } from "@/components/operations/tabs"
import { useOperations } from "@/components/operations/provider"

export default function OperationsDeliveryPage() {
  const { overview, tilesets, load } = useOperations()
  return (
    <DeliveryTab
      domains={overview.customDomains}
      previews={overview.previewLinks}
      tilesets={tilesets}
      onChanged={load}
    />
  )
}
