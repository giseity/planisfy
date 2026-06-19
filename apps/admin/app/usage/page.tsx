import { db, usageLogs } from "@planisfy/database"
import { count, sql, gte, and } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Badge } from "@planisfy/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { UsageCharts } from "./charts"
import { requireAdmin } from "@/features/auth/admin-auth"

export const dynamic = "force-dynamic"

async function getUsageData() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    [totalRow],
    [costRow],
    [errorRow],
    timeseries,
    byEndpoint,
    byStatus,
    recentLogs,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, thirtyDaysAgo)),
    db
      .select({ total: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("total") })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, thirtyDaysAgo)),
    db
      .select({ count: count() })
      .from(usageLogs)
      .where(and(gte(usageLogs.timestamp, thirtyDaysAgo), gte(usageLogs.statusCode, 500))),
    db
      .select({
        date: sql<string>`to_char(${usageLogs.timestamp}, 'MM/DD')`.as("date"),
        requests: count(),
        errors: sql<number>`sum(CASE WHEN ${usageLogs.statusCode} >= 500 THEN 1 ELSE 0 END)`.as("errors"),
        cost: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("cost"),
      })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, thirtyDaysAgo))
      .groupBy(sql`to_char(${usageLogs.timestamp}, 'MM/DD'), date(${usageLogs.timestamp})`)
      .orderBy(sql`date(${usageLogs.timestamp})`),
    db
      .select({
        endpoint: usageLogs.endpoint,
        requests: count(),
        cost: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("cost"),
      })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, thirtyDaysAgo))
      .groupBy(usageLogs.endpoint)
      .orderBy(sql`count(*) DESC`)
      .limit(10),
    db
      .select({
        status: sql<string>`CASE
          WHEN ${usageLogs.statusCode} >= 500 THEN '5xx'
          WHEN ${usageLogs.statusCode} >= 400 THEN '4xx'
          WHEN ${usageLogs.statusCode} >= 300 THEN '3xx'
          WHEN ${usageLogs.statusCode} >= 200 THEN '2xx'
          ELSE 'Other'
        END`.as("status"),
        count: count(),
      })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, thirtyDaysAgo))
      .groupBy(sql`CASE
        WHEN ${usageLogs.statusCode} >= 500 THEN '5xx'
        WHEN ${usageLogs.statusCode} >= 400 THEN '4xx'
        WHEN ${usageLogs.statusCode} >= 300 THEN '3xx'
        WHEN ${usageLogs.statusCode} >= 200 THEN '2xx'
        ELSE 'Other'
      END`),
    db
      .select({
        id: usageLogs.id,
        endpoint: usageLogs.endpoint,
        method: usageLogs.method,
        statusCode: usageLogs.statusCode,
        cost: usageLogs.cost,
        ipAddress: usageLogs.ipAddress,
        timestamp: usageLogs.timestamp,
        apiKeyId: usageLogs.apiKeyId,
      })
      .from(usageLogs)
      .orderBy(sql`${usageLogs.timestamp} DESC`)
      .limit(50),
  ])

  const totalReqs = totalRow?.count ?? 0
  const totalErrors = errorRow?.count ?? 0
  const errorRate = totalReqs > 0 ? ((totalErrors / totalReqs) * 100).toFixed(2) : "0.00"

  return {
    totalRequests: totalReqs,
    totalCost: Number(costRow?.total ?? 0),
    errorRate,
    timeseries: timeseries.map((r) => ({
      ...r,
      requests: Number(r.requests),
      errors: Number(r.errors),
      cost: Number(r.cost),
    })),
    byEndpoint: byEndpoint.map((r) => ({
      ...r,
      requests: Number(r.requests),
      cost: Number(r.cost),
    })),
    byStatus: byStatus.map((r) => ({
      ...r,
      count: Number(r.count),
    })),
    recentLogs,
  }
}

export default async function UsagePage() {
  await requireAdmin()
  const data = await getUsageData()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Platform Usage (Last 30 Days)</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalRequests.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.totalCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.errorRate}%</p>
          </CardContent>
        </Card>
      </div>

      <UsageCharts
        timeseries={data.timeseries}
        byEndpoint={data.byEndpoint}
        byStatus={data.byStatus}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{log.method}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.statusCode >= 500 ? "destructive" :
                        log.statusCode >= 400 ? "warning" : "success"
                      }
                    >
                      {log.statusCode}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.cost}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.apiKeyId ? log.apiKeyId.slice(0, 12) + "..." : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {log.ipAddress || "—"}
                  </TableCell>
                </TableRow>
              ))}
              {data.recentLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No usage data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
