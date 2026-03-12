"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Check } from "lucide-react"

interface BillingInfo {
  plan: string
  planName: string
  price: number
  limits: {
    monthlyUnits: number
    requestsPerMinute: number
    maxStyles: number
    maxSources: number
    maxApiKeys: number
  }
  usage: {
    monthlyUnits: number
    styles: number
    sources: number
    apiKeys: number
  }
  quotaPercent: number
  polarConfigured: boolean
}

interface PlanInfo {
  id: string
  name: string
  price: number
  monthlyUnits: string | number
  requestsPerMinute: number
  maxStyles: string | number
  maxSources: string | number
  maxApiKeys: string | number
}

export default function SettingsPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<BillingInfo>("/billing"),
      api.get<PlanInfo[]>("/billing/plans"),
    ])
      .then(([b, p]) => {
        setBilling(b)
        setPlans(p)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !billing) {
    return (
      <div className="container max-w-6xl py-8 px-4">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const quotaColor = billing.quotaPercent >= 90 ? "bg-red-500" : billing.quotaPercent >= 70 ? "bg-yellow-500" : "bg-green-500"

  return (
    <div className="container max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Current Plan */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <Badge variant={billing.plan === "free" ? "secondary" : billing.plan === "enterprise" ? "warning" : "success"}>
              {billing.planName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Units</p>
              <p className="text-lg font-semibold">
                {billing.usage.monthlyUnits.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {billing.limits.monthlyUnits === Infinity ? "∞" : billing.limits.monthlyUnits.toLocaleString()}
                </span>
              </p>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-full rounded-full ${quotaColor} transition-all`}
                  style={{ width: `${Math.min(billing.quotaPercent, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Styles</p>
              <p className="text-lg font-semibold">
                {billing.usage.styles}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {billing.limits.maxStyles === Infinity ? "∞" : billing.limits.maxStyles}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sources</p>
              <p className="text-lg font-semibold">
                {billing.usage.sources}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {billing.limits.maxSources === Infinity ? "∞" : billing.limits.maxSources}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Keys</p>
              <p className="text-lg font-semibold">
                {billing.usage.apiKeys}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}/ {billing.limits.maxApiKeys === Infinity ? "∞" : billing.limits.maxApiKeys}
                </span>
              </p>
            </div>
          </div>

          {billing.quotaPercent >= 80 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm mb-4">
              You&apos;ve used {billing.quotaPercent}% of your monthly quota. Consider upgrading to avoid service interruptions.
            </div>
          )}

          {billing.polarConfigured && billing.plan !== "free" && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { url } = await api.get<{ url: string }>("/billing/portal")
                  window.open(url, "_blank")
                } catch {
                  alert("Billing portal is not available")
                }
              }}
            >
              Manage Subscription
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <h2 className="text-lg font-semibold mb-4">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {plans.map((plan) => {
          const isCurrent = plan.id === billing.plan
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                  {plan.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.monthlyUnits === "Unlimited" ? "Unlimited" : Number(plan.monthlyUnits).toLocaleString()} API units/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.requestsPerMinute.toLocaleString()} requests/minute
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxStyles === "Unlimited" ? "Unlimited" : plan.maxStyles} styles
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxSources === "Unlimited" ? "Unlimited" : plan.maxSources} data sources
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxApiKeys === "Unlimited" ? "Unlimited" : plan.maxApiKeys} API keys
                  </li>
                </ul>

                {!isCurrent && plan.price > 0 && (
                  <Button
                    className="w-full mt-4"
                    variant={plan.id === "pro" ? "default" : "outline"}
                    disabled={!billing.polarConfigured}
                    onClick={async () => {
                      if (!billing.polarConfigured) {
                        alert("Billing is not configured yet. Set POLAR_ACCESS_TOKEN to enable payments.")
                        return
                      }
                      // In production, this would use the actual Polar price ID
                      alert(`Upgrade to ${plan.name} — payment integration coming soon`)
                    }}
                  >
                    {billing.polarConfigured ? `Upgrade to ${plan.name}` : "Coming soon"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
