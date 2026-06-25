import { Badge } from '@planisfy/ui/components/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from '@planisfy/ui/components/page-header'
import { StatusAlert } from '@planisfy/ui/components/status-alert'
import { Database, HardDrive, Info, Mail, Server, Shield } from 'lucide-react'

const envGroups = [
  {
    label: 'Database',
    icon: Database,
    vars: [
      {
        key: 'DATABASE_URL',
        requirement: 'Required',
        desc: 'Primary PostgreSQL connection string.',
      },
      {
        key: 'REDIS_URL',
        requirement: 'Required',
        desc: 'Redis connection string for queues, caching, and runtime coordination.',
      },
    ],
  },
  {
    label: 'Authentication',
    icon: Shield,
    vars: [
      {
        key: 'BETTER_AUTH_SECRET',
        requirement: 'Required',
        desc: 'Generated secret used by Better Auth.',
      },
      {
        key: 'INTERNAL_API_SECRET',
        requirement: 'Required',
        desc: 'Shared secret for internal service-to-service requests.',
      },
      {
        key: 'GITHUB_CLIENT_ID',
        requirement: 'Optional',
        desc: 'GitHub OAuth application client ID.',
      },
      {
        key: 'GITHUB_CLIENT_SECRET',
        requirement: 'Optional',
        desc: 'GitHub OAuth application client secret.',
      },
      { key: 'GOOGLE_CLIENT_ID', requirement: 'Optional', desc: 'Google OAuth client ID.' },
      {
        key: 'GOOGLE_CLIENT_SECRET',
        requirement: 'Optional',
        desc: 'Google OAuth client secret.',
      },
    ],
  },
  {
    label: 'Email (ZeptoMail)',
    icon: Mail,
    vars: [
      {
        key: 'ZEPTOMAIL_SEND_MAIL_TOKEN',
        requirement: 'Managed',
        desc: 'ZeptoMail send mail token.',
      },
      {
        key: 'ZEPTOMAIL_FROM_AUTH',
        requirement: 'Managed',
        desc: 'Sender identity for account and auth emails.',
      },
      {
        key: 'ZEPTOMAIL_FROM_NOTIFICATIONS',
        requirement: 'Managed',
        desc: 'Sender identity for operational notification emails.',
      },
    ],
  },
  {
    label: 'Object Storage',
    icon: HardDrive,
    vars: [
      {
        key: 'STORAGE_PROVIDER',
        requirement: 'Required',
        desc: 'Storage backend: local, s3, or r2.',
      },
      {
        key: 'LOCAL_STORAGE_PATH',
        requirement: 'Self-host',
        desc: 'Local artifact storage path when STORAGE_PROVIDER=local.',
      },
      {
        key: 'S3_BUCKET',
        requirement: 'S3/R2',
        desc: 'S3-compatible bucket for artifacts.',
      },
      {
        key: 'S3_ENDPOINT',
        requirement: 'S3/R2',
        desc: 'S3-compatible endpoint for object storage.',
      },
      {
        key: 'R2_ACCESS_KEY_ID',
        requirement: 'Managed',
        desc: 'R2 access key ID.',
      },
      {
        key: 'R2_SECRET_ACCESS_KEY',
        requirement: 'Managed',
        desc: 'R2 secret access key.',
      },
      {
        key: 'R2_BUCKET',
        requirement: 'Managed',
        desc: 'R2 bucket for artifacts.',
      },
      {
        key: 'R2_PUBLIC_URL',
        requirement: 'Managed',
        desc: 'Public URL for R2-hosted artifacts.',
      },
    ],
  },
  {
    label: 'Services',
    icon: Server,
    vars: [
      {
        key: 'MARTIN_URL',
        requirement: 'Required',
        desc: 'Martin tile server internal URL.',
      },
      {
        key: 'PELIAS_URL',
        requirement: 'Required',
        desc: 'Pelias-compatible geocoding service URL.',
      },
      {
        key: 'VALHALLA_URL',
        requirement: 'Optional',
        desc: 'Valhalla routing engine URL.',
      },
      { key: 'ELEVATION_URL', requirement: 'Optional', desc: 'Elevation service URL.' },
    ],
  },
]

export default function EnvironmentPage() {
  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Environment</PageTitle>
          <PageDescription>
            Configuration variables for your self-hosted deployment.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant="secondary">Self-hosted</Badge>
        </PageActions>
      </PageHeader>

      <StatusAlert
        icon={<Info className="h-4 w-4" />}
        title="Configuration reference"
        description="Use the platform readiness page for live status. This page lists the environment variables operators commonly need to review."
      />

      {envGroups.map((group) => {
        return (
          <Card key={group.label}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <group.icon className="h-4 w-4 text-muted-foreground" />
                  {group.label}
                </CardTitle>
                <CardDescription>{group.vars.length} environment variables</CardDescription>
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
    requirement: string
  }
}) {
  return (
    <div className="grid overflow-hidden rounded-lg border bg-input/30 md:grid-cols-[minmax(180px,260px)_1fr]">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-mono text-xs font-medium md:border-b-0 md:border-r">
        {envVar.key}
      </div>
      <div className="flex items-center px-3 py-2">
        <Badge variant="secondary">{envVar.requirement}</Badge>
      </div>
    </div>
  )
}
