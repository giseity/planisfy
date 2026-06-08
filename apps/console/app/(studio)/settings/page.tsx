"use client"

import { useEffect, useState } from "react"
import {
  api,
  type PlatformPreflight,
} from "@/lib/api"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@planisfy/ui/components/tabs"
import {
  Cloud,
  CreditCard,
  Shield,
  User,
} from "lucide-react"
import {
  AccountTab,
  BillingTab,
  ExecutionTab,
  ProfileTab,
} from "@/components/studio/settings-tabs"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [preflight, setPreflight] = useState<PlatformPreflight | null>(null)

  useEffect(() => {
    api
      .getPlatformPreflight()
      .then((res) => setPreflight(res.data))
      .catch(() => setPreflight(null))
  }, [])

  const showExecution =
    preflight?.capabilities.some(
      (capability) =>
        capability.id === "customExecutionTargets" && capability.visible,
    ) ?? false

  return (
    <div className="container max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="account">
            <Shield className="h-4 w-4 mr-1.5" />
            Account
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Billing
          </TabsTrigger>
          {showExecution && (
            <TabsTrigger value="execution">
              <Cloud className="h-4 w-4 mr-1.5" />
              Execution
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="account" className="mt-6">
          <AccountTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <BillingTab />
        </TabsContent>
        {showExecution && (
          <TabsContent value="execution" className="mt-6">
            <ExecutionTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
