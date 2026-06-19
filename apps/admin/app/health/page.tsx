import { db, users, apiKeys, sessions, usageLogs, styles } from "@planisfy/database"
import { and, count, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm"
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
import { requireAdmin } from "@/features/auth/admin-auth"

export const dynamic = "force-dynamic"

async function getHealthData() {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    [activeSessions],
    [requestsLastHour],
    [requestsLast24h],
    [errorsLast24h],
    [expiringKeys],
    [expiredKeys],
    [totalUsers],
    [totalStyles],
    recentErrors,
    hourlyStats,
  ] = await Promise.all([
    db.select({ count: count() }).from(sessions).where(gte(sessions.expiresAt, now)),
    db.select({ count: count() }).from(usageLogs).where(gte(usageLogs.timestamp, oneHourAgo)),
    db.select({ count: count() }).from(usageLogs).where(gte(usageLogs.timestamp, oneDayAgo)),
    db
      .select({ count: count() })
      .from(usageLogs)
      .where(and(gte(usageLogs.timestamp, oneDayAgo), gte(usageLogs.statusCode, 500))),
    db
      .select({ count: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.enabled, true),
          isNotNull(apiKeys.expiresAt),
          gte(apiKeys.expiresAt, now),
          lte(apiKeys.expiresAt, sevenDaysFromNow)
        )
      ),
    db
      .select({ count: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.enabled, true),
          isNotNull(apiKeys.expiresAt),
          lt(apiKeys.expiresAt, now)
        )
      ),
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(styles).where(isNull(styles.deletedAt)),
    db
      .select({
        endpoint: usageLogs.endpoint,
        statusCode: usageLogs.statusCode,
        ipAddress: usageLogs.ipAddress,
        timestamp: usageLogs.timestamp,
      })
      .from(usageLogs)
      .where(and(gte(usageLogs.timestamp, oneDayAgo), gte(usageLogs.statusCode, 500)))
      .orderBy(desc(usageLogs.timestamp))
      .limit(20),
    db
      .select({
        hour: sql<string>`to_char(${usageLogs.timestamp}, 'HH24:00')`.as("hour"),
        requests: count(),
        errors: sql<number>`sum(CASE WHEN ${usageLogs.statusCode} >= 500 THEN 1 ELSE 0 END)`.as("errors"),
      })
      .from(usageLogs)
      .where(gte(usageLogs.timestamp, oneDayAgo))
      .groupBy(sql`to_char(${usageLogs.timestamp}, 'HH24:00')`)
      .orderBy(sql`to_char(${usageLogs.timestamp}, 'HH24:00')`),
  ])

  const reqLast24 = requestsLast24h?.count ?? 0
  const errLast24 = errorsLast24h?.count ?? 0
  const errorRate = reqLast24 > 0 ? ((errLast24 / reqLast24) * 100).toFixed(2) : "0.00"

  return {
    activeSessions: activeSessions?.count ?? 0,
    requestsLastHour: requestsLastHour?.count ?? 0,
    requestsLast24h: reqLast24,
    errorsLast24h: errLast24,
    errorRate,
    expiringKeys: expiringKeys?.count ?? 0,
    expiredKeys: expiredKeys?.count ?? 0,
    totalUsers: totalUsers?.count ?? 0,
    totalStyles: totalStyles?.count ?? 0,
    recentErrors,
    hourlyStats,
  }
}

function HealthIndicator({ value, warn, critical }: { value: number; warn: number; critical: number }) {
  const variant = value >= critical ? "destructive" : value >= warn ? "warning" : "success"
  const label = value >= critical ? "Critical" : value >= warn ? "Warning" : "Healthy"
  return <Badge variant={variant}>{label}</Badge>
}

export default async function HealthPage() {
  await requireAdmin()
  const health = await getHealthData()
  const errorRateNum = Number(health.errorRate)

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">System Health</h1>
        <HealthIndicator value={errorRateNum} warn={2} critical={5} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.activeSessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests (1h)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.requestsLastHour.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.requestsLast24h.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Rate (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{health.errorRate}%</p>
              <HealthIndicator value={errorRateNum} warn={2} critical={5} />
            </div>
          </CardContent>
        </Card>
      </div>

      {(health.expiringKeys > 0 || health.expiredKeys > 0 || errorRateNum > 2) && (
        <div className="space-y-2 mb-6">
          {health.expiringKeys > 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm">
              <strong>{health.expiringKeys}</strong> API key{health.expiringKeys !== 1 ? "s" : ""} expiring within 7 days
            </div>
          )}
          {health.expiredKeys > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm">
              <strong>{health.expiredKeys}</strong> expired API key{health.expiredKeys !== 1 ? "s" : ""} still not revoked
            </div>
          )}
          {errorRateNum > 2 && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm">
              Error rate is elevated at <strong>{health.errorRate}%</strong> — check recent errors below
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.totalUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Styles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{health.totalStyles}</p>
          </CardContent>
        </Card>
      </div>

      {health.hourlyStats.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Hourly Breakdown (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Error Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {health.hourlyStats.map((row) => {
                  const rate = row.requests > 0 ? ((Number(row.errors) / row.requests) * 100).toFixed(1) : "0.0"
                  return (
                    <TableRow key={row.hour}>
                      <TableCell className="font-mono text-sm">{row.hour}</TableCell>
                      <TableCell>{row.requests}</TableCell>
                      <TableCell>{Number(row.errors)}</TableCell>
                      <TableCell>
                        <Badge variant={Number(rate) > 5 ? "destructive" : Number(rate) > 2 ? "warning" : "secondary"}>
                          {rate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Errors (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.recentErrors.map((err, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(err.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{err.endpoint}</TableCell>
                  <TableCell>
                    <Badge variant="destructive">{err.statusCode}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{err.ipAddress || "—"}</TableCell>
                </TableRow>
              ))}
              {health.recentErrors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No errors in the last 24 hours
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
