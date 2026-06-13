import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { StatusAlert } from "@planisfy/ui/components/status-alert"
import { Switch } from "@planisfy/ui/components/switch"
import {
  BarChart3,
  CheckCircle2,
  Gauge,
  History,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  ServerCog,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react"
import { requireAdmin } from "@/lib/admin-auth"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

const configGroups = [
  {
    label: "Platform",
    icon: SlidersHorizontal,
    items: [
      { key: "PLATFORM_MODE", value: "managed", type: "select", desc: "Deployment mode controls which capabilities are available." },
      { key: "PLATFORM_NAME", value: "Planisfy", type: "text", desc: "Display name shown in the UI and emails." },
      { key: "PLATFORM_URL", value: "https://planisfy.acme.com", type: "text", desc: "Canonical public URL for the platform." },
      { key: "PLATFORM_VERSION", value: "v1.4.2", type: "text", readonly: true, desc: "Current running version." },
    ],
  },
  {
    label: "Rate Limits",
    icon: Gauge,
    items: [
      { key: "RATE_LIMIT_FREE", value: "60", type: "number", unit: "req/min", desc: "Rate limit for Free plan API keys." },
      { key: "RATE_LIMIT_PRO", value: "300", type: "number", unit: "req/min", desc: "Rate limit for Pro plan API keys." },
      { key: "RATE_LIMIT_ENTERPRISE", value: "1000", type: "number", unit: "req/min", desc: "Rate limit for Enterprise plan API keys." },
      { key: "RATE_LIMIT_BURST", value: "10", type: "number", unit: "req", desc: "Burst allowance above the per-minute limit." },
    ],
  },
  {
    label: "Quotas",
    icon: BarChart3,
    items: [
      { key: "QUOTA_FREE_UNITS", value: "100000", type: "number", unit: "units/mo", desc: "Monthly unit quota for Free plan." },
      { key: "QUOTA_PRO_UNITS", value: "1000000", type: "number", unit: "units/mo", desc: "Monthly unit quota for Pro plan." },
      { key: "QUOTA_FREE_KEYS", value: "5", type: "number", desc: "Max API keys for Free plan." },
      { key: "QUOTA_FREE_STYLES", value: "10", type: "number", desc: "Max styles for Free plan." },
      { key: "QUOTA_FREE_TILESETS", value: "5", type: "number", desc: "Max tilesets for Free plan." },
    ],
  },
  {
    label: "Workers",
    icon: ServerCog,
    items: [
      { key: "WORKER_CONCURRENCY", value: "4", type: "number", desc: "Max concurrent processing jobs per worker." },
      { key: "WORKER_TIMEOUT", value: "3600", type: "number", unit: "seconds", desc: "Max execution time before a job is marked failed." },
      { key: "WORKER_RETRY_MAX", value: "3", type: "number", desc: "Maximum retry attempts for failed jobs." },
      { key: "WORKER_RETRY_DELAY", value: "60", type: "number", unit: "seconds", desc: "Delay between retry attempts." },
    ],
  },
  {
    label: "Maintenance",
    icon: Wrench,
    items: [
      { key: "MAINTENANCE_MODE", value: "false", type: "toggle", desc: "Blocks API requests with 503 when enabled." },
      { key: "MAINTENANCE_MESSAGE", value: "", type: "text", desc: "Message shown to users during maintenance." },
      { key: "LOG_LEVEL", value: "info", type: "select", desc: "Server log verbosity." },
      { key: "CLEANUP_RETENTION_DAYS", value: "90", type: "number", unit: "days", desc: "Retention for soft-deleted artifacts." },
    ],
  },
]

export default async function ConfigurationPage() {
  await requireAdmin()

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Platform Configuration</PageTitle>
          <PageDescription>Runtime configuration for the Planisfy platform.</PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant="success">Managed mode</Badge>
          <Button variant="outline">
            <History className="h-4 w-4" />
            Change log
          </Button>
          <Button>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </PageActions>
      </PageHeader>

      <StatusAlert
        variant="success"
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="All configuration values are valid"
        description="Last validated 2 minutes ago. Changes require a server restart to take effect."
      />

      {configGroups.map((group) => (
        <Card key={group.label}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <group.icon className="h-4 w-4 text-muted-foreground" />
              {group.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.items.map((item) => (
              <div key={item.key}>
                <ConfigRow item={item} />
                <p className="mt-1 pl-3 text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Dangerous actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <DangerAction
            title="Purge all caches"
            description="Clear tile and style caches. Clients will re-fetch."
            action="Purge"
            icon={<Trash2 className="h-4 w-4" />}
          />
          <DangerAction
            title="Reset rate limit counters"
            description="Clear all per-key rate limit windows immediately."
            action="Reset"
            icon={<RotateCcw className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ConfigRow({
  item,
}: {
  item: {
    key: string
    value: string
    type: string
    unit?: string
    readonly?: boolean
  }
}) {
  return (
    <div className="grid overflow-hidden rounded-lg border bg-input/30 md:grid-cols-[240px_1fr_auto]">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-mono text-xs font-medium md:border-b-0 md:border-r">
        {item.key}
        {item.readonly && <Lock className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className="flex min-h-9 items-center px-3 py-2 text-sm">
        {item.type === "toggle" ? (
          <div className="flex items-center gap-2">
            <Switch checked={item.value === "true"} aria-label={item.key} />
            <span className="text-muted-foreground">
              {item.value === "true" ? "Enabled" : "Disabled"}
            </span>
          </div>
        ) : (
          <span className={item.type === "number" ? "font-mono" : undefined}>
            {item.value || "Not set"}{" "}
            {item.unit && <span className="text-xs text-muted-foreground">{item.unit}</span>}
          </span>
        )}
      </div>
      {!item.readonly && (
        <Button variant="ghost" size="icon-sm" className="m-1 justify-self-start md:justify-self-end" aria-label={`Edit ${item.key}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function DangerAction({
  action,
  description,
  icon,
  title,
}: {
  action: string
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-background/70 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="sm">
        {icon}
        {action}
      </Button>
    </div>
  )
}
