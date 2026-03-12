"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Badge } from "@planisfy/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { Button } from "@planisfy/ui/components/button"
import { Activity, Zap, Key, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface UsageSummary {
  totalRequests: number
  totalUnits: number
  activeApiKeys: number
  previousPeriod: {
    totalRequests: number
    totalUnits: number
  }
}

interface TimeseriesEntry {
  date: string
  tiles: number
  styles: number
  geocoding: number
  directions: number
  elevation: number
  static: number
  other: number
  total: number
}

interface ByKeyEntry {
  apiKeyId: string | null
  name: string
  requests: number
  units: number
}

interface UsageLogEntry {
  id: string
  apiKeyId: string | null
  endpoint: string
  method: string
  statusCode: number
  cost: number
  ipAddress: string | null
  timestamp: string
}

const SERVICE_COLORS: Record<string, string> = {
  tiles: "#3b82f6",
  styles: "#8b5cf6",
  geocoding: "#22c55e",
  directions: "#f97316",
  elevation: "#f59e0b",
  static: "#06b6d4",
  other: "#6b7280",
}

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f97316", "#f59e0b", "#06b6d4", "#6b7280"]

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return null
  const isUp = pct > 0
  return (
    <span className={`flex items-center text-xs ${isUp ? "text-emerald-600" : "text-red-500"}`}>
      {isUp ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
      {Math.abs(pct)}%
    </span>
  )
}

export default function UsagePage() {
  const [period, setPeriod] = useState("30")
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesEntry[]>([])
  const [byKey, setByKey] = useState<ByKeyEntry[]>([])
  const [logs, setLogs] = useState<UsageLogEntry[]>([])
  const [logPage, setLogPage] = useState(1)
  const [logTotal, setLogTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, timeseriesRes, byKeyRes, logsRes] = await Promise.all([
        api.get<{ data: UsageSummary }>("/usage/summary"),
        api.get<{ data: TimeseriesEntry[] }>(`/usage/timeseries?days=${period}`),
        api.get<{ data: ByKeyEntry[] }>(`/usage/by-key?days=${period}`),
        api.get<{ data: UsageLogEntry[]; pagination: { total: number } }>(`/usage/logs?page=${logPage}&limit=20`),
      ])
      setSummary(summaryRes.data)
      setTimeseries(timeseriesRes.data)
      setByKey(byKeyRes.data)
      setLogs(logsRes.data)
      setLogTotal(logsRes.pagination.total)
    } catch (err) {
      console.error("Failed to fetch usage data:", err)
    } finally {
      setLoading(false)
    }
  }, [period, logPage])

  useEffect(() => { fetchData() }, [fetchData])

  // Prepare pie data from by-key
  const pieData = byKey.filter((k) => k.requests > 0).map((k) => ({
    name: k.name,
    value: k.requests,
  }))

  // Plan quota (hardcoded for now — will come from billing in Phase 8)
  const quotaLimit = 50_000
  const quotaUsed = summary?.totalUnits ?? 0
  const quotaPercent = Math.min(100, Math.round((quotaUsed / quotaLimit) * 100))

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Usage</h1>
          <Badge variant="secondary">Free plan</Badge>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quota warning */}
      {quotaPercent >= 80 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              You've used {quotaPercent}% of your monthly quota.
            </p>
            <p className="text-xs text-muted-foreground">
              Upgrade to avoid service interruption.
            </p>
          </div>
          <Button size="sm">Upgrade</Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : formatNumber(summary?.totalRequests ?? 0)}
            </div>
            {summary && (
              <TrendIndicator
                current={summary.totalRequests}
                previous={summary.previousPeriod.totalRequests}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units Consumed</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : `${formatNumber(quotaUsed)} / ${formatNumber(quotaLimit)}`}
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${quotaPercent >= 80 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active API Keys</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "..." : summary?.activeApiKeys ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {period === "7" ? "7 days" : period === "30" ? "30 days" : "90 days"}
            </div>
            {summary && (
              <TrendIndicator
                current={summary.totalUnits}
                previous={summary.previousPeriod.totalUnits}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        {/* Usage over time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {timeseries.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="tiles" stackId="1" stroke={SERVICE_COLORS.tiles} fill={SERVICE_COLORS.tiles} fillOpacity={0.6} name="Tiles" />
                  <Area type="monotone" dataKey="styles" stackId="1" stroke={SERVICE_COLORS.styles} fill={SERVICE_COLORS.styles} fillOpacity={0.6} name="Styles" />
                  <Area type="monotone" dataKey="geocoding" stackId="1" stroke={SERVICE_COLORS.geocoding} fill={SERVICE_COLORS.geocoding} fillOpacity={0.6} name="Geocoding" />
                  <Area type="monotone" dataKey="directions" stackId="1" stroke={SERVICE_COLORS.directions} fill={SERVICE_COLORS.directions} fillOpacity={0.6} name="Directions" />
                  <Area type="monotone" dataKey="elevation" stackId="1" stroke={SERVICE_COLORS.elevation} fill={SERVICE_COLORS.elevation} fillOpacity={0.6} name="Elevation" />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage by API key */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By API Key</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name.slice(0, 10)}${name.length > 10 ? "..." : ""} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage by key bar chart */}
      {byKey.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Requests by API Key</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(150, byKey.length * 40)}>
              <BarChart data={byKey} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="requests" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent logs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>API Key</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {log.endpoint}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{log.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.statusCode < 300 ? "success" :
                            log.statusCode < 400 ? "secondary" :
                            log.statusCode < 500 ? "warning" : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {log.statusCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.cost}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {log.apiKeyId?.slice(0, 12) || "session"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {logTotal > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {logPage} of {Math.ceil(logTotal / 20)}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={logPage <= 1}
                      onClick={() => setLogPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={logPage >= Math.ceil(logTotal / 20)}
                      onClick={() => setLogPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No usage data yet. Make some API requests to see data here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
