import { randomUUID } from 'node:crypto'
import {
  accounts,
  db,
  managedContracts,
  usageAllowanceGrants,
  usageBillingPeriods,
} from '@planisfy/database'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Badge } from '@planisfy/ui/components/badge'
import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import {
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from '@planisfy/ui/components/page-header'
import { Textarea } from '@planisfy/ui/components/textarea'
import { requirePlatformPermission } from '@/features/auth/admin-auth'
import {
  assignManagedContractAction,
  grantUsageAllowanceAction,
} from '@/features/billing/billing-admin-actions'
import { adminMetadata } from '../../lib/metadata'

export const metadata = adminMetadata({
  title: 'Managed Billing Contracts',
  description: 'Assign managed plans, spend caps, and temporary usage grants.',
  path: '/billing-contracts',
})

export const dynamic = 'force-dynamic'

export default async function BillingContractsPage() {
  await requirePlatformPermission('platform.configuration.manage')

  const [accountRows, contracts, grants, periods] = await Promise.all([
    db
      .select({
        id: accounts.id,
        handle: accounts.handle,
        displayName: accounts.displayName,
        type: accounts.type,
      })
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .orderBy(accounts.handle),
    db
      .select({
        id: managedContracts.id,
        accountId: managedContracts.accountId,
        handle: accounts.handle,
        planId: managedContracts.planId,
        includedMonthlyUnits: managedContracts.includedMonthlyUnits,
        overageEnabled: managedContracts.overageEnabled,
        overageUnitPriceMicros: managedContracts.overageUnitPriceMicros,
        hardMonthlySpendCapCents: managedContracts.hardMonthlySpendCapCents,
        currency: managedContracts.currency,
        status: managedContracts.status,
        assignmentReason: managedContracts.assignmentReason,
        effectiveAt: managedContracts.effectiveAt,
      })
      .from(managedContracts)
      .innerJoin(accounts, eq(accounts.id, managedContracts.accountId))
      .orderBy(desc(managedContracts.effectiveAt))
      .limit(100),
    db
      .select({
        id: usageAllowanceGrants.id,
        accountId: usageAllowanceGrants.accountId,
        handle: accounts.handle,
        units: usageAllowanceGrants.units,
        reason: usageAllowanceGrants.reason,
        validUntil: usageAllowanceGrants.validUntil,
      })
      .from(usageAllowanceGrants)
      .innerJoin(accounts, eq(accounts.id, usageAllowanceGrants.accountId))
      .orderBy(desc(usageAllowanceGrants.createdAt))
      .limit(50),
    db
      .select({
        id: usageBillingPeriods.id,
        handle: accounts.handle,
        periodStart: usageBillingPeriods.periodStart,
        usedUnits: usageBillingPeriods.usedUnits,
        includedUnits: usageBillingPeriods.includedUnits,
        grantedUnits: usageBillingPeriods.grantedUnits,
        overageUnits: usageBillingPeriods.overageUnits,
        overageAmountMicros: usageBillingPeriods.overageAmountMicros,
        currency: managedContracts.currency,
      })
      .from(usageBillingPeriods)
      .innerJoin(accounts, eq(accounts.id, usageBillingPeriods.accountId))
      .leftJoin(
        managedContracts,
        and(
          eq(managedContracts.accountId, usageBillingPeriods.accountId),
          eq(managedContracts.status, 'ACTIVE')
        )
      )
      .orderBy(desc(usageBillingPeriods.periodStart))
      .limit(50),
  ])

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Managed Billing Contracts</PageTitle>
          <PageDescription>
            Plans remain code-defined. Operators can assign an audited contract and issue expiring,
            idempotent usage grants.
          </PageDescription>
        </PageHeaderText>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assign contract</CardTitle>
            <CardDescription>
              Replaces the account&apos;s active contract. Overage always requires a hard monthly
              spend cap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={assignManagedContractAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Account">
                <AccountSelect accounts={accountRows} />
              </Field>
              <Field label="Plan">
                <select
                  name="planId"
                  defaultValue="platform"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="scale">Scale</option>
                  <option value="platform">Platform</option>
                </select>
              </Field>
              <Field label="Included monthly units">
                <Input
                  name="includedMonthlyUnits"
                  type="number"
                  min={0}
                  defaultValue={8_000_000}
                  required
                />
              </Field>
              <Field label="Currency">
                <Input name="currency" defaultValue="USD" maxLength={8} />
              </Field>
              <Field label="Overage price (micros/unit)">
                <Input name="overageUnitPriceMicros" type="number" min={1} defaultValue={10} />
              </Field>
              <Field label="Hard monthly spend cap (cents)">
                <Input
                  name="hardMonthlySpendCapCents"
                  type="number"
                  min={0}
                  defaultValue={50_000}
                />
              </Field>
              <Field label="Provider subscription ID">
                <Input name="providerSubscriptionId" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input name="overageEnabled" type="checkbox" />
                Metered overage enabled
              </label>
              <div className="sm:col-span-2">
                <Field label="Assignment reason">
                  <Textarea
                    name="assignmentReason"
                    required
                    placeholder="Commercial agreement or approved internal tenant"
                  />
                </Field>
              </div>
              <Button type="submit" className="w-fit">
                Assign contract
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grant temporary units</CardTitle>
            <CardDescription>
              Grants expire automatically and retries reuse an idempotency key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={grantUsageAllowanceAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <Field label="Account">
                <AccountSelect accounts={accountRows} />
              </Field>
              <Field label="Units">
                <Input name="units" type="number" min={1} defaultValue={100_000} required />
              </Field>
              <Field label="Valid for days">
                <Input
                  name="validityDays"
                  type="number"
                  min={1}
                  max={366}
                  defaultValue={30}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Grant reason">
                  <Textarea name="reason" required />
                </Field>
              </div>
              <Button type="submit" className="w-fit">
                Grant units
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contract history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  @{contract.handle} · {contract.planId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {contract.includedMonthlyUnits.toLocaleString()} included ·{' '}
                  {contract.assignmentReason}
                </p>
              </div>
              <div className="text-right">
                <Badge variant={contract.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {contract.status}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(contract.effectiveAt)}
                </p>
              </div>
            </div>
          ))}
          {contracts.length === 0 && <Empty label="No contracts assigned." />}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent grants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grants.map((grant) => (
              <div key={grant.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  @{grant.handle} · +{grant.units.toLocaleString()} units
                </p>
                <p className="text-xs text-muted-foreground">
                  Until {formatDate(grant.validUntil)} · {grant.reason}
                </p>
              </div>
            ))}
            {grants.length === 0 && <Empty label="No usage grants." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reconciled periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {periods.map((period) => (
              <div key={period.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  @{period.handle} · {period.usedUnits.toLocaleString()} used
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(period.periodStart)} · {period.overageUnits.toLocaleString()} overage
                  · {formatMoneyMicros(period.overageAmountMicros, period.currency)}
                </p>
              </div>
            ))}
            {periods.length === 0 && <Empty label="No reconciled periods." />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AccountSelect({
  accounts,
}: {
  accounts: Array<{
    id: string
    handle: string
    displayName: string
    type: 'USER' | 'ORGANIZATION'
  }>
}) {
  return (
    <select
      name="accountId"
      required
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
    >
      <option value="">Select account</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          @{account.handle} · {account.displayName} ({account.type.toLowerCase()})
        </option>
      ))}
    </select>
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

function Empty({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatMoneyMicros(value: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(value / 1_000_000)
}
