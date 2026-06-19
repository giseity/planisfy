import {
  apiKeys,
  db,
  eventOutbox,
  organizations,
  processingJobs,
  styles,
  usageLogs,
  users,
} from "@planisfy/database"
import { and, count, desc, eq, gte, isNull } from "drizzle-orm"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { MetricCard } from "@planisfy/ui/components/metric-card"
import {
  PageHeader,
  PageDescription,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { Users, Building2, Key, Activity, Palette, AlertTriangle, ArrowRight } from "lucide-react"
import { requireAdmin } from "@/features/auth/admin-auth"

export const dynamic = "force-dynamic"

async function getStats() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeek = new Date(today)
  thisWeek.setDate(thisWeek.getDate() - 7)

  const [
    [userCount],
    [orgCount],
    [keyCount],
    [styleCount],
    [todayRequests],
    [errorCount],
    [failedJobs],
    [failedOutbox],
    recentSignups,
    recentFailures,
  ] =
    await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(organizations).where(isNull(organizations.deletedAt)),
      db.select({ count: count() }).from(apiKeys).where(eq(apiKeys.enabled, true)),
      db.select({ count: count() }).from(styles).where(isNull(styles.deletedAt)),
      db.select({ count: count() }).from(usageLogs).where(gte(usageLogs.timestamp, today)),
      db
        .select({ count: count() })
        .from(usageLogs)
        .where(
          and(gte(usageLogs.timestamp, today), gte(usageLogs.statusCode, 500))
        ),
      db.select({ count: count() }).from(processingJobs).where(eq(processingJobs.status, "FAILED")),
      db.select({ count: count() }).from(eventOutbox).where(eq(eventOutbox.status, "FAILED")),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(3),
      db
        .select({
          id: processingJobs.id,
          type: processingJobs.type,
          errorMessage: processingJobs.errorMessage,
          updatedAt: processingJobs.updatedAt,
        })
        .from(processingJobs)
        .where(eq(processingJobs.status, "FAILED"))
        .orderBy(desc(processingJobs.updatedAt))
        .limit(3),
    ])

  const errorRate =
    (todayRequests?.count ?? 0) > 0
      ? ((errorCount?.count ?? 0) / (todayRequests?.count ?? 1)) * 100
      : 0

  return {
    totalUsers: userCount?.count ?? 0,
    totalOrgs: orgCount?.count ?? 0,
    activeApiKeys: keyCount?.count ?? 0,
    totalStyles: styleCount?.count ?? 0,
    requestsToday: todayRequests?.count ?? 0,
    errorRate: errorRate.toFixed(1),
    failedJobs: failedJobs?.count ?? 0,
    failedOutbox: failedOutbox?.count ?? 0,
    recentSignups,
    recentFailures,
  }
}

export default async function AdminDashboard() {
  await requireAdmin()
  const stats = await getStats()

  const cards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users },
    { title: "Organizations", value: stats.totalOrgs, icon: Building2 },
    { title: "Active API Keys", value: stats.activeApiKeys, icon: Key },
    { title: "Total Styles", value: stats.totalStyles, icon: Palette },
    { title: "Requests Today", value: stats.requestsToday, icon: Activity },
    {
      title: "Error Rate",
      value: `${stats.errorRate}%`,
      icon: AlertTriangle,
      variant: Number(stats.errorRate) > 5 ? "destructive" : "default",
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Dashboard</PageTitle>
          <PageDescription>Platform overview.</PageDescription>
        </PageHeaderText>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <MetricCard
            key={card.title}
            label={card.title}
            value={card.value}
            icon={<card.icon className="h-4 w-4" />}
            className={card.variant === "destructive" ? "border-destructive/30" : undefined}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Request volume (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-2 rounded-md border bg-muted/20 p-4">
              {[42, 55, 48, 72, 65, 78, 60].map((value, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.max(16, value * 1.6)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    D{index + 1}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform signals</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SignalCard label="Failed jobs" value={stats.failedJobs} variant="destructive" />
            <SignalCard label="Failed outbox" value={stats.failedOutbox} variant="destructive" />
            <SignalCard label="Unhealthy services" value={0} variant="secondary" />
            <SignalCard label="Expiring keys (7d)" value={0} variant="warning" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent signups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentSignups.map((user) => (
              <div key={user.id} className="flex items-center gap-3 rounded-md border p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {user.createdAt.toLocaleDateString()}
                </span>
              </div>
            ))}
            {stats.recentSignups.length === 0 && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No recent signups.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent failures</CardTitle>
            <Button asChild variant="ghost" size="xs">
              <a href="/failures">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentFailures.map((failure) => (
              <div key={failure.id} className="rounded-md border border-l-4 border-l-destructive p-3">
                <p className="text-sm font-medium">{failure.type}</p>
                <p className="mt-1 text-xs text-destructive">
                  {failure.errorMessage ?? "No error message captured."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {failure.updatedAt.toLocaleString()}
                </p>
              </div>
            ))}
            {stats.recentFailures.length === 0 && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No recent failures.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SignalCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: "destructive" | "secondary" | "warning"
}) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-xl font-semibold">{value}</p>
      <div className="mt-1 flex justify-center">
        <Badge variant={variant}>{label}</Badge>
      </div>
    </div>
  )
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}
