import { db, users, organizations, apiKeys, usageLogs, styles } from "@planisfy/database"
import { count, gte, isNull, and } from "drizzle-orm"
import { MetricCard } from "@planisfy/ui/components/metric-card"
import {
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { Users, Building2, Key, Activity, Palette, AlertTriangle } from "lucide-react"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

async function getStats() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeek = new Date(today)
  thisWeek.setDate(thisWeek.getDate() - 7)

  const [[userCount], [orgCount], [keyCount], [styleCount], [todayRequests], [errorCount]] =
    await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(organizations).where(isNull(organizations.deletedAt)),
      db.select({ count: count() }).from(apiKeys).where(isNull(apiKeys.deletedAt)),
      db.select({ count: count() }).from(styles).where(isNull(styles.deletedAt)),
      db.select({ count: count() }).from(usageLogs).where(gte(usageLogs.timestamp, today)),
      db
        .select({ count: count() })
        .from(usageLogs)
        .where(
          and(gte(usageLogs.timestamp, today), gte(usageLogs.statusCode, 500))
        ),
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
    <div>
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Dashboard</PageTitle>
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
    </div>
  )
}
