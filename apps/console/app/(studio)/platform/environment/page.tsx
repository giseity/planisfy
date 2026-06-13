import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Clipboard,
  Database,
  Download,
  Eye,
  HardDrive,
  Info,
  Mail,
  Pencil,
  Plus,
  Save,
  Server,
  Shield,
  Upload,
} from "lucide-react"

const envGroups = [
  {
    label: "Database",
    icon: Database,
    vars: [
      { key: "DATABASE_URL", value: "postgresql://planisfy:********@db:5432/planisfy", sensitive: true, required: true, desc: "Primary PostgreSQL connection string." },
      { key: "DATABASE_POOL_SIZE", value: "20", required: false, desc: "Max database pool connections." },
      { key: "DATABASE_SSL", value: "true", required: false, desc: "Require SSL for database connections." },
    ],
  },
  {
    label: "Authentication",
    icon: Shield,
    vars: [
      { key: "AUTH_SECRET", value: "************************", sensitive: true, required: true, desc: "JWT signing secret for session tokens." },
      { key: "AUTH_URL", value: "https://planisfy.acme.com", required: true, desc: "Canonical URL used for OAuth callbacks." },
      { key: "GITHUB_CLIENT_ID", value: "Ov23liXkP9a2bQ7mNdRe", required: false, desc: "GitHub OAuth application client ID." },
      { key: "GITHUB_CLIENT_SECRET", value: "************************", sensitive: true, required: false, desc: "GitHub OAuth application client secret." },
      { key: "GOOGLE_CLIENT_ID", value: "", required: false, desc: "Google OAuth client ID." },
      { key: "GOOGLE_CLIENT_SECRET", value: "", sensitive: true, required: false, desc: "Google OAuth client secret." },
    ],
  },
  {
    label: "Email (Resend)",
    icon: Mail,
    vars: [
      { key: "RESEND_API_KEY", value: "re_********************", sensitive: true, required: true, desc: "Resend API key for transactional email." },
      { key: "EMAIL_FROM", value: "noreply@planisfy.acme.com", required: true, desc: "Sender address for platform emails." },
    ],
  },
  {
    label: "Object Storage",
    icon: HardDrive,
    vars: [
      { key: "R2_ACCOUNT_ID", value: "a1b2c3d4e5f6g7h8", required: true, desc: "Cloudflare R2 account identifier." },
      { key: "R2_ACCESS_KEY_ID", value: "****************", sensitive: true, required: true, desc: "R2 access key ID." },
      { key: "R2_SECRET_ACCESS_KEY", value: "************************", sensitive: true, required: true, desc: "R2 secret access key." },
      { key: "R2_BUCKET_TILES", value: "planisfy-tiles", required: true, desc: "Bucket name for tile storage." },
      { key: "R2_BUCKET_STYLES", value: "planisfy-styles", required: false, desc: "Bucket name for style JSON storage." },
    ],
  },
  {
    label: "Services",
    icon: Server,
    vars: [
      { key: "MARTIN_URL", value: "http://martin:3000", required: true, desc: "Martin tile server internal URL." },
      { key: "PELIAS_URL", value: "http://pelias:4000", required: true, desc: "Pelias-compatible geocoding service URL." },
      { key: "VALHALLA_URL", value: "http://valhalla:8002", required: false, desc: "Valhalla routing engine URL." },
      { key: "ELEVATION_URL", value: "", required: false, desc: "Elevation service URL." },
    ],
  },
]

export default function EnvironmentPage() {
  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Environment</PageTitle>
          <PageDescription>Configuration variables for your self-hosted deployment.</PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant="secondary">Self-hosted</Badge>
          <Button variant="outline">
            <Download className="h-4 w-4" />
            Export .env
          </Button>
          <Button variant="outline">
            <Upload className="h-4 w-4" />
            Import .env
          </Button>
          <Button>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </PageActions>
      </PageHeader>

      <StatusAlert
        icon={<Info className="h-4 w-4" />}
        title="5 of 6 required variables are configured"
        description="Set all required variables before the platform can start serving requests."
      />

      {envGroups.map((group) => {
        const configured = group.vars.filter((item) => item.value).length
        return (
          <Card key={group.label}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <group.icon className="h-4 w-4 text-muted-foreground" />
                  {group.label}
                </CardTitle>
                <CardDescription>
                  {configured}/{group.vars.length} configured
                </CardDescription>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="xs">
                  <Eye className="h-3.5 w-3.5" />
                  Reveal all
                </Button>
                <Button variant="ghost" size="xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.vars.map((envVar) => (
                <div key={envVar.key}>
                  <EnvRow envVar={envVar} />
                  <p className="mt-1 pl-3 text-xs text-muted-foreground">{envVar.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function EnvRow({
  envVar,
}: {
  envVar: {
    key: string
    value: string
    sensitive?: boolean
    required: boolean
  }
}) {
  return (
    <div className="grid overflow-hidden rounded-lg border bg-input/30 md:grid-cols-[220px_1fr_auto]">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-mono text-xs font-medium md:border-b-0 md:border-r">
        {envVar.key}
        {envVar.required && <span className="text-destructive">*</span>}
      </div>
      <div className="min-w-0 px-3 py-2 font-mono text-xs">
        <span className={envVar.value ? "block truncate" : "text-muted-foreground"}>
          {envVar.value || "Not configured"}
        </span>
      </div>
      <div className="flex border-t md:border-l md:border-t-0">
        {envVar.sensitive && (
          <Button variant="ghost" size="icon-sm" aria-label={`Reveal ${envVar.key}`}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={`Copy ${envVar.key}`}>
          <Clipboard className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${envVar.key}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
