"use client"

import { BillingTab } from "@/features/settings/tabs"
import {
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"

export default function BillingPage() {
  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Billing</PageTitle>
          <PageDescription>Review plan limits, usage, and billing portal access.</PageDescription>
        </PageHeaderText>
      </PageHeader>
      <BillingTab />
    </div>
  )
}
