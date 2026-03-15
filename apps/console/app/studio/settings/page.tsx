"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { authClient, useSession } from "@planisfy/auth/client"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@planisfy/ui/components/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@planisfy/ui/components/dialog"
import { Check, CreditCard, Monitor, Shield, X } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface SessionData {
  id: string
  token: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="container max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">
            <Shield className="h-4 w-4 mr-1.5" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Billing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="mt-6">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sessions Tab
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Edg/")) return "Edge"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Safari")) return "Safari"
  if (ua.includes("curl")) return "curl"
  return "Unknown browser"
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

function SessionsTab() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)

  const currentToken = session?.session?.token

  const fetchSessions = useCallback(async () => {
    try {
      const res = await authClient.listSessions()
      if (res.data) {
        setSessions(res.data as unknown as SessionData[])
      }
    } catch {
      console.error("Failed to fetch sessions")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleRevoke = async () => {
    if (!revokeId) return
    const sessionToRevoke = sessions.find((s) => s.id === revokeId)
    if (!sessionToRevoke) return
    try {
      await authClient.revokeSession({ token: sessionToRevoke.token })
      setRevokeId(null)
      await fetchSessions()
    } catch {
      alert("Failed to revoke session")
    }
  }

  const handleRevokeAll = async () => {
    try {
      await authClient.revokeOtherSessions()
      setRevokeAllOpen(false)
      await fetchSessions()
    } catch {
      alert("Failed to revoke sessions")
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const otherSessions = sessions.filter((s) => s.token !== currentToken)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Manage your active sessions across devices.
          </p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeAllOpen(true)}
          >
            Revoke all other sessions
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {parseUserAgent(s.userAgent)}
                    </span>
                    {isCurrent && (
                      <Badge variant="success" className="text-[10px]">
                        Current
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.ipAddress ?? "Unknown"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {timeAgo(s.updatedAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevokeId(s.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Revoke single session */}
      <Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session?</DialogTitle>
            <DialogDescription>
              This will sign out the device immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke all others */}
      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke all other sessions?</DialogTitle>
            <DialogDescription>
              All devices except your current session will be signed out
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeAll}>
              Revoke all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Billing Tab (moved from original page)
// ---------------------------------------------------------------------------

function BillingTab() {
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
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const quotaColor =
    billing.quotaPercent >= 90
      ? "bg-red-500"
      : billing.quotaPercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500"

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <Badge
              variant={
                billing.plan === "free"
                  ? "secondary"
                  : billing.plan === "enterprise"
                    ? "warning"
                    : "success"
              }
            >
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
                  {" "}
                  /{" "}
                  {billing.limits.monthlyUnits === Infinity
                    ? "\u221e"
                    : billing.limits.monthlyUnits.toLocaleString()}
                </span>
              </p>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-full rounded-full ${quotaColor} transition-all`}
                  style={{
                    width: `${Math.min(billing.quotaPercent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Styles</p>
              <p className="text-lg font-semibold">
                {billing.usage.styles}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxStyles === Infinity
                    ? "\u221e"
                    : billing.limits.maxStyles}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sources</p>
              <p className="text-lg font-semibold">
                {billing.usage.sources}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxSources === Infinity
                    ? "\u221e"
                    : billing.limits.maxSources}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Keys</p>
              <p className="text-lg font-semibold">
                {billing.usage.apiKeys}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxApiKeys === Infinity
                    ? "\u221e"
                    : billing.limits.maxApiKeys}
                </span>
              </p>
            </div>
          </div>

          {billing.quotaPercent >= 80 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm mb-4">
              You&apos;ve used {billing.quotaPercent}% of your monthly quota.
              Consider upgrading to avoid service interruptions.
            </div>
          )}

          {billing.polarConfigured && billing.plan !== "free" && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { url } = await api.get<{ url: string }>(
                    "/billing/portal"
                  )
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
      <h2 className="text-lg font-semibold">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.monthlyUnits === "Unlimited"
                      ? "Unlimited"
                      : Number(plan.monthlyUnits).toLocaleString()}{" "}
                    API units/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.requestsPerMinute.toLocaleString()} requests/minute
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxStyles === "Unlimited"
                      ? "Unlimited"
                      : plan.maxStyles}{" "}
                    styles
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxSources === "Unlimited"
                      ? "Unlimited"
                      : plan.maxSources}{" "}
                    data sources
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxApiKeys === "Unlimited"
                      ? "Unlimited"
                      : plan.maxApiKeys}{" "}
                    API keys
                  </li>
                </ul>

                {!isCurrent && plan.price > 0 && (
                  <Button
                    className="w-full mt-4"
                    variant={plan.id === "pro" ? "default" : "outline"}
                    disabled={!billing.polarConfigured}
                    onClick={async () => {
                      if (!billing.polarConfigured) {
                        alert(
                          "Billing is not configured yet. Set POLAR_ACCESS_TOKEN to enable payments."
                        )
                        return
                      }
                      alert(
                        `Upgrade to ${plan.name} — payment integration coming soon`
                      )
                    }}
                  >
                    {billing.polarConfigured
                      ? `Upgrade to ${plan.name}`
                      : "Coming soon"}
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
