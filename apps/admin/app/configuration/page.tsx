import { db, platformConfig } from '@planisfy/database'
import { Badge } from '@planisfy/ui/components/badge'
import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { Checkbox } from '@planisfy/ui/components/checkbox'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from '@planisfy/ui/components/page-header'
import { StatusAlert } from '@planisfy/ui/components/status-alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@planisfy/ui/components/table'
import { Textarea } from '@planisfy/ui/components/textarea'
import { Database, Save, SlidersHorizontal } from 'lucide-react'
import { requirePlatformPermission } from '@/features/auth/admin-auth'
import { upsertPlatformConfigAction } from '@/features/platform/platform-admin-actions'
import type { AdminDeploymentMode } from '@/features/navigation/admin-navigation'

export const dynamic = 'force-dynamic'

const runtimeKeys: Array<{
  key: string
  modes?: AdminDeploymentMode[]
}> = [
  { key: 'DEPLOYMENT_MODE' },
  { key: 'NODE_ENV' },
  { key: 'NEXT_PUBLIC_API_URL' },
  { key: 'NEXT_PUBLIC_CONSOLE_URL' },
  { key: 'APP_VERSION' },
  { key: 'STORAGE_PROVIDER' },
  { key: 'S3_BUCKET' },
  { key: 'S3_ENDPOINT' },
  { key: 'R2_ACCOUNT_ID', modes: ['managed'] },
  { key: 'R2_BUCKET', modes: ['managed'] },
  { key: 'R2_ACCESS_KEY_ID', modes: ['managed'] },
  { key: 'R2_SECRET_ACCESS_KEY', modes: ['managed'] },
  { key: 'R2_ENDPOINT', modes: ['managed'] },
  { key: 'R2_PUBLIC_URL', modes: ['managed'] },
  { key: 'MINIO_ROOT_USER', modes: ['self_host'] },
  { key: 'MINIO_ROOT_PASSWORD', modes: ['self_host'] },
  { key: 'SUPERVISOR_URL', modes: ['self_host'] },
  { key: 'SUPERVISOR_TOKEN', modes: ['self_host'] },
  { key: 'MARTIN_URL' },
  { key: 'PELIAS_URL' },
  { key: 'VALHALLA_URL' },
  { key: 'ZEPTOMAIL_SEND_MAIL_TOKEN', modes: ['managed'] },
  { key: 'ZEPTOMAIL_FROM_AUTH', modes: ['managed'] },
  { key: 'ZEPTOMAIL_FROM_NOTIFICATIONS', modes: ['managed'] },
  { key: 'DODO_PAYMENTS_API_KEY', modes: ['managed'] },
  { key: 'DODO_PAYMENTS_WEBHOOK_SECRET', modes: ['managed'] },
  { key: 'DODO_STARTER_MONTHLY_PRODUCT_ID', modes: ['managed'] },
  { key: 'DODO_SCALE_MONTHLY_PRODUCT_ID', modes: ['managed'] },
]

const secretPattern = /(SECRET|KEY|TOKEN|PASSWORD|DATABASE_URL|REDIS_URL)/i

export default async function ConfigurationPage() {
  await requirePlatformPermission('platform.configuration.manage')
  const deploymentMode: AdminDeploymentMode =
    process.env.DEPLOYMENT_MODE === 'managed' ? 'managed' : 'self_host'
  const rows = await db
    .select()
    .from(platformConfig)
    .orderBy(platformConfig.category, platformConfig.key)
  const runtimeRows = runtimeKeys
    .filter((item) => !item.modes || item.modes.includes(deploymentMode))
    .map((item) => ({
      key: item.key,
      configured: Boolean(process.env[item.key]),
      value: formatEnvValue(item.key, process.env[item.key]),
    }))

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Platform Configuration</PageTitle>
          <PageDescription>
            Runtime environment state and persisted admin-managed settings.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant={deploymentMode === 'managed' ? 'success' : 'secondary'}>
            {deploymentMode === 'managed' ? 'Managed' : 'Self-host'}
          </Badge>
          <Badge variant="secondary">{rows.length} persisted</Badge>
        </PageActions>
      </PageHeader>

      <StatusAlert
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Persisted settings are live"
        description="Values saved here are stored in platform_config and audited. Runtime environment variables remain read-only because they are deployment state."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save className="h-4 w-4 text-muted-foreground" />
            Add Setting
          </CardTitle>
          <CardDescription>
            Store platform-level settings that application code can consume from the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={upsertPlatformConfigAction}
            className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Field label="Key">
              <Input name="key" required placeholder="SUPPORT_CONTACT_URL" />
            </Field>
            <Field label="Category">
              <Input name="category" defaultValue="General" />
            </Field>
            <Field label="Value type">
              <Input name="valueType" defaultValue="text" />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Create</Button>
            </div>
            <Field label="Value">
              <Textarea name="value" rows={3} />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={3} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox name="isSecret" />
              Secret value
            </label>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />
            Persisted Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell colSpan={5}>
                    <form
                      action={upsertPlatformConfigAction}
                      className="grid gap-2 lg:grid-cols-[1.1fr_0.8fr_1.2fr_1.2fr_auto]"
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="key" defaultValue={row.key} />
                      <Input name="category" defaultValue={row.category} />
                      <Input
                        name="value"
                        defaultValue={row.isSecret ? '' : row.value}
                        placeholder={row.isSecret ? 'Leave blank to clear' : ''}
                      />
                      <Input name="description" defaultValue={row.description ?? ''} />
                      <input type="hidden" name="valueType" value={row.valueType} />
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox name="isSecret" defaultChecked={row.isSecret} />
                        Secret
                      </label>
                      <Button type="submit" size="sm">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    No persisted settings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runtime Environment</CardTitle>
          <CardDescription>
            Read-only deployment state visible to the Admin process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runtimeRows.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="font-mono text-xs">{item.key}</TableCell>
                  <TableCell>
                    <Badge variant={item.configured ? 'success' : 'warning'}>
                      {item.configured ? 'Configured' : 'Missing'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function formatEnvValue(key: string, value: string | undefined) {
  if (!value) return 'Not configured'
  if (secretPattern.test(key)) return 'Configured'
  return value
}
