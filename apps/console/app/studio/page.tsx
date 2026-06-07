"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Code2,
  Database,
  ExternalLink,
  FileCode2,
  Gauge,
  Key,
  Loader2,
  Map,
  Palette,
  Plus,
  RefreshCcw,
  Server,
  Settings,
  Upload,
  XCircle,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { cn } from "@planisfy/ui/lib/utils"
import { api, type ConsoleDashboard, type DashboardHealthStatus } from "@/lib/api"

const statusColor: Record<DashboardHealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  not_configured: "bg-muted-foreground",
  offline: "bg-destructive",
}

const endpointLabels: Record<string, string> = {
  tiles: "Tiles",
  styles: "Styles",
  geocoding: "Geocoding",
  directions: "Directions",
  elevation: "Elevation",
  static: "Static maps",
  other: "Other",
}

const quickActions = [
  { label: "Create style", href: "/studio/styles", icon: Palette },
  { label: "Upload tileset", href: "/studio/sources", icon: Upload },
  { label: "Create API key", href: "/studio/keys", icon: Key },
  { label: "View usage", href: "/studio/usage", icon: BarChart3 },
  { label: "Open docs", href: "https://docs.planisfy.localhost", icon: FileCode2 },
  { label: "Settings", href: "/studio/settings", icon: Settings },
]

export default function StudioDashboardPage() {
  const [dashboard, setDashboard] = useState<ConsoleDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDashboard(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await api.getDashboard()
      setDashboard(response.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
    const interval = window.setInterval(() => {
      void loadDashboard(true)
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [])

  const blockingReadiness = useMemo(
    () => dashboard?.readiness.filter((item) => item.required && !item.complete) ?? [],
    [dashboard],
  )

  if (loading) {
    return (
      <div className="container max-w-7xl px-4 py-6">
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="container max-w-7xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Dashboard unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {error ?? "The dashboard response was empty."}
            </p>
            <Button onClick={() => loadDashboard()} size="sm">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasUsage = dashboard.usage.timeseries.some((point) => point.total > 0)

  return (
    <div className="container max-w-7xl space-y-5 px-4 py-5">
      {blockingReadiness.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div>
                <p className="text-sm font-medium">Setup still needs attention</p>
                <p className="text-sm text-muted-foreground">
                  {blockingReadiness.map((item) => item.label).join(", ")}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={blockingReadiness[0]?.actionHref ?? "/studio/settings"}>
                Continue setup
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {dashboard.account.displayName} / {dashboard.account.handle}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Updated {formatDateTime(dashboard.generatedAt)}
        </div>
      </div>

      <StatusStrip dashboard={dashboard} />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <UsageChart dashboard={dashboard} hasUsage={hasUsage} />
          <div className="grid gap-5 xl:grid-cols-2">
            <EndpointBreakdown dashboard={dashboard} />
            <TopApiKeys dashboard={dashboard} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <RecentJobs dashboard={dashboard} />
            <RecentActivity dashboard={dashboard} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <RecentStyles dashboard={dashboard} />
            <RecentTilesets dashboard={dashboard} />
          </div>
        </div>

        <div className="space-y-5">
          <OperationsAlerts dashboard={dashboard} />
          <HealthRail dashboard={dashboard} />
          <QuickActions />
          <SetupReadiness dashboard={dashboard} />
          <IntegrationPanel dashboard={dashboard} />
        </div>
      </div>
    </div>
  )
}

function StatusStrip({ dashboard }: { dashboard: ConsoleDashboard }) {
  const items = [
    {
      label: "Plan",
      value: dashboard.billing.planName,
      hint: `${dashboard.billing.quota.percent}% quota used`,
      icon: Gauge,
    },
    {
      label: "Quota remaining",
      value:
        dashboard.billing.quota.remaining === null
          ? "Unlimited"
          : formatNumber(dashboard.billing.quota.remaining),
      hint: `${formatNumber(dashboard.billing.quota.used)} units used`,
      icon: Activity,
    },
    {
      label: "Requests",
      value: formatNumber(dashboard.summary.totalRequests),
      hint: `${dashboard.summary.errorRate}% error rate`,
      icon: BarChart3,
    },
    {
      label: "API keys",
      value: formatNumber(dashboard.summary.activeApiKeys),
      hint: "active keys",
      icon: Key,
    },
    {
      label: "Published",
      value: `${dashboard.summary.publishedStyles}/${dashboard.summary.publishedTilesets}`,
      hint: "styles / tilesets",
      icon: Map,
    },
    {
      label: "Jobs",
      value: `${dashboard.summary.runningJobs}/${dashboard.summary.failedJobs}`,
      hint: "running / failed",
      icon: Server,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} className="min-h-[104px]">
          <CardContent className="flex h-full items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{item.label}</p>
              <p className="truncate text-lg font-semibold">{item.value}</p>
              <p className="truncate text-xs text-muted-foreground">{item.hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function OperationsAlerts({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" />
          Operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        <div className="grid grid-cols-3 gap-2">
          <SignalTile
            label="Services"
            value={dashboard.operations.unhealthyServices}
          />
          <SignalTile
            label="Stale jobs"
            value={dashboard.operations.jobSignals.staleRunningJobs}
          />
          <SignalTile
            label="Failures"
            value={dashboard.operations.jobSignals.failedJobs}
          />
        </div>
        {dashboard.operations.alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "rounded-md border p-3",
              alert.severity === "critical" &&
                "border-destructive/30 bg-destructive/5",
              alert.severity === "warning" &&
                "border-amber-500/30 bg-amber-500/5",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {alert.message}
                </p>
              </div>
              <Badge variant={alertVariant(alert.severity)}>
                {alert.severity}
              </Badge>
            </div>
            {alert.actionHref && alert.actionLabel && (
              <Button asChild className="mt-3" size="sm" variant="outline">
                <Link href={alert.actionHref}>{alert.actionLabel}</Link>
              </Button>
            )}
          </div>
        ))}
        {dashboard.operations.jobSignals.recentFailures.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Recent failures
            </p>
            <div className="mt-2 space-y-2">
              {dashboard.operations.jobSignals.recentFailures.map((failure) => (
                <div key={failure.id} className="min-w-0">
                  <p className="truncate text-xs font-medium">{failure.type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {failure.errorCode ?? "FAILED"} /{" "}
                    {failure.errorMessage ?? "No message"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SignalTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2 text-center">
      <p className="text-lg font-semibold">{formatNumber(value)}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function HealthRail({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" />
          Service health
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-0">
        {dashboard.health.map((entry) => (
          <div
            key={entry.id}
            className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", statusColor[entry.status])} />
                <p className="truncate text-sm font-medium">{entry.label}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {entry.message ?? latencyLabel(entry.latencyMs)}
              </p>
            </div>
            <Badge variant={statusVariant(entry.status)}>{statusLabel(entry.status)}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function UsageChart({
  dashboard,
  hasUsage,
}: {
  dashboard: ConsoleDashboard
  hasUsage: boolean
}) {
  return (
    <Card className="min-h-[360px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Usage over time
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {hasUsage ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.usage.timeseries}>
                <defs>
                  <linearGradient id="dashboardUsage" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" minTickGap={28} tickLine={false} />
                <YAxis tickLine={false} width={42} />
                <Tooltip />
                <Area
                  dataKey="total"
                  fill="url(#dashboardUsage)"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            actionHref="/studio/keys"
            actionLabel="Create key"
            icon={Code2}
            text="No usage has been recorded yet. Create an API key and publish a style or tileset to generate integration traffic."
          />
        )}
      </CardContent>
    </Card>
  )
}

function EndpointBreakdown({ dashboard }: { dashboard: ConsoleDashboard }) {
  const rows = dashboard.usage.endpointBreakdown.filter(
    (row) => row.requests > 0 || row.units > 0,
  )
  return (
    <Card className="min-h-[300px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Endpoint breakdown</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {rows.length > 0 ? (
          <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="category"
                  tickFormatter={(value: string) => endpointLabels[value] ?? value}
                  tickLine={false}
                />
                <YAxis tickLine={false} width={42} />
                <Tooltip
                  labelFormatter={(value) => endpointLabels[String(value)] ?? value}
                />
                <Bar dataKey="units" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            actionHref="/studio/usage"
            actionLabel="Open usage"
            icon={BarChart3}
            text="Endpoint activity will appear here after requests reach the API."
          />
        )}
      </CardContent>
    </Card>
  )
}

function TopApiKeys({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card className="min-h-[300px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Top API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.usage.topApiKeys.length > 0 ? (
          dashboard.usage.topApiKeys.map((key) => (
            <div key={key.apiKeyId ?? key.name} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <Badge variant={key.errorCount > 0 ? "warning" : "secondary"}>
                  {formatNumber(key.requests)} req
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(key.units)} units / last used {formatDate(key.lastUsedAt)}
              </p>
            </div>
          ))
        ) : (
          <EmptyState
            actionHref="/studio/keys"
            actionLabel="Create key"
            icon={Key}
            text="API key ranking appears once authenticated traffic starts."
          />
        )}
      </CardContent>
    </Card>
  )
}

function RecentJobs({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card className="min-h-[330px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Processing jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.resources.recentJobs.length > 0 ? (
          dashboard.resources.recentJobs.slice(0, 5).map((job) => (
            <div key={job.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{job.type}</p>
                <Badge variant={jobVariant(job.status)}>{job.status}</Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                />
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {job.progress}% / {formatDateTime(job.updatedAt)}
              </p>
              {job.errorMessage && (
                <p className="mt-1 truncate text-xs text-destructive">
                  {job.errorMessage}
                </p>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            actionHref="/studio/sources"
            actionLabel="Upload tileset"
            icon={Database}
            text="Upload processing jobs will appear here with progress and failure details."
          />
        )}
      </CardContent>
    </Card>
  )
}

function RecentActivity({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card className="min-h-[330px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.resources.recentAudit.length > 0 ? (
          dashboard.resources.recentAudit.slice(0, 6).map((event) => (
            <div key={event.id} className="flex items-center gap-3 rounded-md border p-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{event.action}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {event.resourceType} / {formatDateTime(event.timestamp)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            actionHref="/studio/styles"
            actionLabel="Create style"
            icon={Activity}
            text="Resource changes and publishing events will be logged here."
          />
        )}
      </CardContent>
    </Card>
  )
}

function RecentStyles({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card className="min-h-[320px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Recent styles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.resources.recentStyles.length > 0 ? (
          dashboard.resources.recentStyles.map((style) => (
            <div key={style.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{style.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {style.handle} / v{style.version}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {style.publicUrl && (
                  <IconButton
                    label="Copy style URL"
                    onClick={() => copyText(style.publicUrl, "Style URL copied")}
                  >
                    <Clipboard className="h-4 w-4" />
                  </IconButton>
                )}
                <Button asChild size="icon-sm" variant="ghost">
                  <Link href={`/studio/styles/${style.id}`} aria-label="Edit style">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            actionHref="/studio/styles"
            actionLabel="Create style"
            icon={Palette}
            text="No styles yet. Start with a style, then publish it for client maps."
          />
        )}
      </CardContent>
    </Card>
  )
}

function RecentTilesets({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card className="min-h-[320px]">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Recent tilesets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.resources.recentTilesets.length > 0 ? (
          dashboard.resources.recentTilesets.map((tileset) => (
            <div key={tileset.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{tileset.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tileset.handle} / {tileset.status}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {tileset.tilejsonUrl && (
                  <IconButton
                    label="Copy TileJSON URL"
                    onClick={() => copyText(tileset.tilejsonUrl, "TileJSON URL copied")}
                  >
                    <Clipboard className="h-4 w-4" />
                  </IconButton>
                )}
                <Button asChild size="icon-sm" variant="ghost">
                  <Link href="/studio/sources" aria-label="Open tilesets">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            actionHref="/studio/sources"
            actionLabel="Upload tileset"
            icon={Database}
            text="No tilesets yet. Upload GeoJSON, CSV, shapefile, PMTiles, or MBTiles data."
          />
        )}
      </CardContent>
    </Card>
  )
}

function QuickActions() {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0">
        {quickActions.map((action) => {
          const external = action.href.startsWith("http")
          const content = (
            <>
              <action.icon className="h-4 w-4" />
              {action.label}
            </>
          )
          return (
            <Button key={action.label} asChild size="sm" variant="outline">
              <Link href={action.href} target={external ? "_blank" : undefined}>
                {content}
              </Link>
            </Button>
          )
        })}
      </CardContent>
    </Card>
  )
}

function SetupReadiness({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Setup readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {dashboard.readiness.map((item) => (
          <div key={item.id} className="flex items-start gap-3 rounded-md border p-3">
            {item.complete ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <Badge variant={item.complete ? "success" : item.required ? "warning" : "secondary"}>
                  {item.required ? "Required" : "Optional"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function IntegrationPanel({ dashboard }: { dashboard: ConsoleDashboard }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Code2 className="h-4 w-4" />
          Developer integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <CopyRow label="API base URL" value={dashboard.integration.apiBaseUrl} />
        {dashboard.integration.publicStyleUrl ? (
          <CopyRow label="Public style URL" value={dashboard.integration.publicStyleUrl} />
        ) : (
          <MissingRow label="Public style URL" action="Publish a style" />
        )}
        {dashboard.integration.tilejsonUrl ? (
          <CopyRow label="TileJSON URL" value={dashboard.integration.tilejsonUrl} />
        ) : (
          <MissingRow label="TileJSON URL" action="Publish a tileset" />
        )}
        {dashboard.integration.mapLibreSnippet ? (
          <CodeBlock
            label="MapLibre"
            value={dashboard.integration.mapLibreSnippet}
          />
        ) : (
          <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Complete {dashboard.integration.missing.join(", ")} to generate a client snippet.
          </p>
        )}
        {dashboard.integration.curlSnippet && (
          <CodeBlock label="curl" value={dashboard.integration.curlSnippet} />
        )}
      </CardContent>
    </Card>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <IconButton label={`Copy ${label}`} onClick={() => copyText(value, `${label} copied`)}>
          <Clipboard className="h-4 w-4" />
        </IconButton>
      </div>
      <p className="truncate font-mono text-xs">{value}</p>
    </div>
  )
}

function MissingRow({ label, action }: { label: string; action: string }) {
  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs">{action}</p>
    </div>
  )
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <IconButton label={`Copy ${label}`} onClick={() => copyText(value, `${label} copied`)}>
          <Clipboard className="h-4 w-4" />
        </IconButton>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code>{value}</code>
      </pre>
    </div>
  )
}

function EmptyState({
  actionHref,
  actionLabel,
  icon: Icon,
  text,
}: {
  actionHref: string
  actionLabel: string
  icon: React.ComponentType<{ className?: string }>
  text: string
}) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-md border border-dashed p-5 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      <Button asChild size="sm">
        <Link href={actionHref}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Link>
      </Button>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon-sm" type="button" variant="ghost">
      {children}
    </Button>
  )
}

function statusVariant(status: DashboardHealthStatus) {
  if (status === "healthy") return "success"
  if (status === "degraded") return "warning"
  if (status === "offline") return "destructive"
  return "secondary"
}

function alertVariant(severity: "info" | "warning" | "critical") {
  if (severity === "critical") return "destructive" as const
  if (severity === "warning") return "warning" as const
  return "secondary" as const
}

function jobVariant(status: string) {
  if (status === "FAILED") return "destructive"
  if (status === "COMPLETED" || status === "READY") return "success"
  if (status === "PROCESSING" || status === "PENDING") return "warning"
  return "secondary"
}

function statusLabel(status: DashboardHealthStatus) {
  return status.replace("_", " ")
}

function latencyLabel(latencyMs?: number | null) {
  return typeof latencyMs === "number" ? `${Math.round(latencyMs)}ms` : "No details"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatDate(value: string | null) {
  if (!value) return "never"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

function formatDateTime(value: string | null) {
  if (!value) return "never"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

async function copyText(value: string | null, message: string) {
  if (!value) return
  await navigator.clipboard.writeText(value)
  toast.success(message)
}
