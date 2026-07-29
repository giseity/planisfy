import {
  billableRequests,
  billingWebhookEvents,
  db,
  managedContracts,
  usageAllowanceGrants,
  usageBillingPeriods,
  usageBillingPeriodSegments,
  usageLogs,
} from '@planisfy/database'
import { PLANS, normalizePlanSlug, type PlanLimits, type PlanSlug } from '@planisfy/types'
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { getMonthlyUsagePeriod, type MonthlyUsagePeriod } from '../usage/usage-quota'

const MICROS_PER_CENT = 10_000
const BILLING_PERIOD_CLOSE_GRACE_MS = 24 * 60 * 60 * 1000
const CALCULATION_VERSION = 2

export interface ManagedContractEntitlement {
  contractId: string
  planId: PlanSlug
  includedUnits: number
  grantedUnits: number
  maximumOverageUnits: number
  monthlyQuota: number
  overageUnitPriceMicros: number | null
  hardMonthlySpendCapCents: number | null
  currency: string
}

export interface ManagedContractAssignment {
  accountId: string
  planId: PlanSlug
  includedMonthlyUnits: number
  overageEnabled: boolean
  overageUnitPriceMicros?: number | null
  hardMonthlySpendCapCents?: number | null
  currency?: string
  effectiveAt?: Date
  expiresAt?: Date | null
  providerSubscriptionId?: string | null
  assignedByAccountId?: string | null
  assignmentReason: string
}

export function calculateMaximumOverageUnits(params: {
  overageEnabled: boolean
  overageUnitPriceMicros: number | null
  hardMonthlySpendCapCents: number | null
}): number {
  if (!params.overageEnabled) return 0
  if (
    !params.overageUnitPriceMicros ||
    params.overageUnitPriceMicros <= 0 ||
    params.hardMonthlySpendCapCents === null ||
    params.hardMonthlySpendCapCents < 0
  ) {
    return 0
  }

  return Math.floor(
    (params.hardMonthlySpendCapCents * MICROS_PER_CENT) / params.overageUnitPriceMicros
  )
}

export async function getManagedContractEntitlement(
  accountId: string,
  now = new Date()
): Promise<ManagedContractEntitlement | null> {
  const [contract] = await db
    .select()
    .from(managedContracts)
    .where(
      and(
        eq(managedContracts.accountId, accountId),
        eq(managedContracts.status, 'ACTIVE'),
        lte(managedContracts.effectiveAt, now),
        or(isNull(managedContracts.expiresAt), gt(managedContracts.expiresAt, now))
      )
    )
    .orderBy(desc(managedContracts.effectiveAt))
    .limit(1)

  if (!contract) return null
  const planId = normalizePlanSlug(contract.planId)
  if (!planId) {
    throw new Error(`Managed contract ${contract.id} has an unknown plan`)
  }

  const [grant] = await db
    .select({
      units: sql<number>`coalesce(sum(${usageAllowanceGrants.units}), 0)`,
    })
    .from(usageAllowanceGrants)
    .where(
      and(
        eq(usageAllowanceGrants.accountId, accountId),
        lte(usageAllowanceGrants.validFrom, now),
        gt(usageAllowanceGrants.validUntil, now)
      )
    )

  const grantedUnits = Number(grant?.units ?? 0)
  const maximumOverageUnits = calculateMaximumOverageUnits(contract)
  const monthlyQuota = contract.includedMonthlyUnits + grantedUnits + maximumOverageUnits

  return {
    contractId: contract.id,
    planId,
    includedUnits: contract.includedMonthlyUnits,
    grantedUnits,
    maximumOverageUnits,
    monthlyQuota,
    overageUnitPriceMicros: contract.overageUnitPriceMicros,
    hardMonthlySpendCapCents: contract.hardMonthlySpendCapCents,
    currency: contract.currency,
  }
}

export async function getManagedPlanLimits(accountId: string): Promise<PlanLimits | null> {
  const entitlement = await getManagedContractEntitlement(accountId)
  if (!entitlement) return null

  return {
    ...PLANS[entitlement.planId],
    monthlyUnits: entitlement.monthlyQuota,
  }
}

export async function assignManagedContract(assignment: ManagedContractAssignment) {
  validateManagedContractAssignment(assignment)
  const effectiveAt = assignment.effectiveAt ?? new Date()

  return db.transaction(async (tx) => {
    await tx
      .update(managedContracts)
      .set({ status: 'SUPERSEDED', expiresAt: effectiveAt })
      .where(
        and(
          eq(managedContracts.accountId, assignment.accountId),
          eq(managedContracts.status, 'ACTIVE')
        )
      )

    const [contract] = await tx
      .insert(managedContracts)
      .values({
        accountId: assignment.accountId,
        planId: assignment.planId,
        includedMonthlyUnits: assignment.includedMonthlyUnits,
        overageEnabled: assignment.overageEnabled,
        overageUnitPriceMicros: assignment.overageUnitPriceMicros ?? null,
        hardMonthlySpendCapCents: assignment.hardMonthlySpendCapCents ?? null,
        currency: (assignment.currency ?? 'USD').trim().toUpperCase(),
        effectiveAt,
        expiresAt: assignment.expiresAt ?? null,
        providerSubscriptionId: assignment.providerSubscriptionId ?? null,
        assignedByAccountId: assignment.assignedByAccountId ?? null,
        assignmentReason: assignment.assignmentReason.trim(),
      })
      .returning()

    return contract
  })
}

export async function grantUsageAllowance(params: {
  accountId: string
  units: number
  validFrom?: Date
  validUntil: Date
  reason: string
  idempotencyKey: string
  grantedByAccountId?: string | null
}) {
  if (!Number.isSafeInteger(params.units) || params.units <= 0) {
    throw new Error('Grant units must be a positive integer')
  }
  if (!params.reason.trim()) throw new Error('Grant reason is required')
  if (!params.idempotencyKey.trim()) {
    throw new Error('Grant idempotency key is required')
  }

  const validFrom = params.validFrom ?? new Date()
  if (params.validUntil <= validFrom) {
    throw new Error('Grant expiry must be after its start')
  }

  const [grant] = await db
    .insert(usageAllowanceGrants)
    .values({
      accountId: params.accountId,
      units: params.units,
      validFrom,
      validUntil: params.validUntil,
      reason: params.reason.trim(),
      idempotencyKey: params.idempotencyKey.trim(),
      grantedByAccountId: params.grantedByAccountId ?? null,
    })
    .onConflictDoNothing({
      target: [usageAllowanceGrants.accountId, usageAllowanceGrants.idempotencyKey],
    })
    .returning()

  if (grant) return grant
  const [existing] = await db
    .select()
    .from(usageAllowanceGrants)
    .where(
      and(
        eq(usageAllowanceGrants.accountId, params.accountId),
        eq(usageAllowanceGrants.idempotencyKey, params.idempotencyKey.trim())
      )
    )
    .limit(1)
  return existing
}

export async function reconcileManagedUsagePeriod(params: {
  accountId: string
  period?: MonthlyUsagePeriod
  now?: Date
}) {
  const period = params.period ?? getMonthlyUsagePeriod()
  const now = params.now ?? new Date()
  const [existing] = await db
    .select()
    .from(usageBillingPeriods)
    .where(
      and(
        eq(usageBillingPeriods.accountId, params.accountId),
        eq(usageBillingPeriods.periodStart, period.start)
      )
    )
    .limit(1)
  if (existing?.status === 'CLOSED') return existing

  const contracts = await db
    .select()
    .from(managedContracts)
    .where(
      and(
        eq(managedContracts.accountId, params.accountId),
        lt(managedContracts.effectiveAt, period.end),
        or(isNull(managedContracts.expiresAt), gt(managedContracts.expiresAt, period.start))
      )
    )
    .orderBy(asc(managedContracts.effectiveAt))
  if (contracts.length === 0) return null

  const grants = await db
    .select()
    .from(usageAllowanceGrants)
    .where(
      and(
        eq(usageAllowanceGrants.accountId, params.accountId),
        lt(usageAllowanceGrants.validFrom, period.end),
        gt(usageAllowanceGrants.validUntil, period.start)
      )
    )
    .orderBy(asc(usageAllowanceGrants.validUntil), asc(usageAllowanceGrants.createdAt))
  const logs = await db
    .select({ timestamp: usageLogs.timestamp, cost: usageLogs.cost })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, params.accountId),
        gte(usageLogs.timestamp, period.start),
        lt(usageLogs.timestamp, period.end),
        gte(usageLogs.statusCode, 200),
        lt(usageLogs.statusCode, 400)
      )
    )
    .orderBy(asc(usageLogs.timestamp))

  const segments = calculateEntitlementSegments({
    period,
    contracts,
    grants,
    usage: logs.map((log) => ({
      timestamp: log.timestamp,
      units: Number(log.cost ?? 0),
    })),
  })
  if (segments.length === 0) return null

  const includedUnits = sum(segments.map((segment) => segment.includedUnits))
  const grantedUnits = sum(segments.map((segment) => segment.grantedUnits))
  const usedUnits = sum(segments.map((segment) => segment.usedUnits))
  const overageUnits = sum(segments.map((segment) => segment.overageUnits))
  const overageAmountMicros = sum(segments.map((segment) => segment.overageAmountMicros))
  const status =
    now.getTime() >= period.end.getTime() + BILLING_PERIOD_CLOSE_GRACE_MS ? 'CLOSED' : 'OPEN'

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(usageBillingPeriods)
      .values({
        accountId: params.accountId,
        periodStart: period.start,
        periodEnd: period.end,
        includedUnits,
        grantedUnits,
        usedUnits,
        overageUnits,
        overageAmountMicros,
        status,
        reconciledAt: now,
      })
      .onConflictDoUpdate({
        target: [usageBillingPeriods.accountId, usageBillingPeriods.periodStart],
        set: {
          periodEnd: period.end,
          includedUnits,
          grantedUnits,
          usedUnits,
          overageUnits,
          overageAmountMicros,
          status,
          reconciledAt: now,
          updatedAt: now,
        },
      })
      .returning()
    if (!row) throw new Error('Failed to persist usage billing period')

    await tx
      .delete(usageBillingPeriodSegments)
      .where(eq(usageBillingPeriodSegments.periodId, row.id))
    await tx.insert(usageBillingPeriodSegments).values(
      segments.map((segment) => ({
        periodId: row.id,
        contractId: segment.contractId,
        segmentStart: segment.segmentStart,
        segmentEnd: segment.segmentEnd,
        includedUnits: segment.includedUnits,
        grantedUnits: segment.grantedUnits,
        usedUnits: segment.usedUnits,
        overageUnits: segment.overageUnits,
        overageUnitPriceMicros: segment.overageUnitPriceMicros,
        hardSpendCapCents: segment.hardSpendCapCents,
        overageAmountMicros: segment.overageAmountMicros,
        currency: segment.currency,
        calculationVersion: CALCULATION_VERSION,
      }))
    )
    return row
  })
}

export async function reconcileOpenManagedUsagePeriods(now = new Date()) {
  const contracts = await db
    .selectDistinct({ accountId: managedContracts.accountId })
    .from(managedContracts)
    .where(
      and(
        lt(managedContracts.effectiveAt, getMonthlyUsagePeriod(now).end),
        or(
          isNull(managedContracts.expiresAt),
          gt(managedContracts.expiresAt, getMonthlyUsagePeriod(previousMonth(now)).start)
        )
      )
    )

  const existingOpen = await db
    .select({
      accountId: usageBillingPeriods.accountId,
      periodStart: usageBillingPeriods.periodStart,
      periodEnd: usageBillingPeriods.periodEnd,
    })
    .from(usageBillingPeriods)
    .where(eq(usageBillingPeriods.status, 'OPEN'))
  const current = getMonthlyUsagePeriod(now)
  const previous = getMonthlyUsagePeriod(previousMonth(now))
  const work = new Map<string, { accountId: string; period: MonthlyUsagePeriod; now: Date }>()
  for (const { accountId } of contracts) {
    work.set(`${accountId}:${current.key}`, { accountId, period: current, now })
    work.set(`${accountId}:${previous.key}`, { accountId, period: previous, now })
  }
  for (const row of existingOpen) {
    const period = {
      start: row.periodStart,
      end: row.periodEnd,
      key: periodKey(row.periodStart),
    }
    work.set(`${row.accountId}:${period.key}`, { accountId: row.accountId, period, now })
  }
  return Promise.all([...work.values()].map(reconcileManagedUsagePeriod))
}

export async function deleteExpiredBillableRequests(now = new Date(), retentionDays = 7) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  await db.delete(billableRequests).where(lt(billableRequests.createdAt, cutoff))
  const processedWebhookCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  await db
    .delete(billingWebhookEvents)
    .where(
      and(
        isNotNull(billingWebhookEvents.processedAt),
        lt(billingWebhookEvents.processedAt, processedWebhookCutoff)
      )
    )
}

function validateManagedContractAssignment(assignment: ManagedContractAssignment) {
  const currency = (assignment.currency ?? 'USD').trim().toUpperCase()
  if (currency === 'XXX' || !Intl.supportedValuesOf('currency').includes(currency)) {
    throw new Error('Currency must be a supported three-letter ISO 4217 code')
  }
  if (
    !Number.isSafeInteger(assignment.includedMonthlyUnits) ||
    assignment.includedMonthlyUnits < 0
  ) {
    throw new Error('Included monthly units must be a non-negative integer')
  }
  if (!assignment.assignmentReason.trim()) {
    throw new Error('Contract assignment reason is required')
  }
  if (assignment.expiresAt && assignment.expiresAt <= (assignment.effectiveAt ?? new Date())) {
    throw new Error('Contract expiry must be after its effective date')
  }
  if (
    assignment.overageEnabled &&
    (!assignment.overageUnitPriceMicros ||
      assignment.overageUnitPriceMicros <= 0 ||
      assignment.hardMonthlySpendCapCents === undefined ||
      assignment.hardMonthlySpendCapCents === null ||
      assignment.hardMonthlySpendCapCents < 0)
  ) {
    throw new Error('Metered overage requires a positive unit price and a hard spend cap')
  }
}

type ContractRow = typeof managedContracts.$inferSelect
type GrantRow = typeof usageAllowanceGrants.$inferSelect

export interface CalculatedEntitlementSegment {
  contractId: string
  segmentStart: Date
  segmentEnd: Date
  includedUnits: number
  grantedUnits: number
  usedUnits: number
  overageUnits: number
  overageUnitPriceMicros: number | null
  hardSpendCapCents: number | null
  overageAmountMicros: number
  currency: string
}

export function calculateEntitlementSegments(params: {
  period: MonthlyUsagePeriod
  contracts: ContractRow[]
  grants: GrantRow[]
  usage: Array<{ timestamp: Date; units: number }>
}): CalculatedEntitlementSegment[] {
  const boundaries = new Set<number>([params.period.start.getTime(), params.period.end.getTime()])
  for (const contract of params.contracts) {
    addBoundary(boundaries, contract.effectiveAt, params.period)
    if (contract.expiresAt) addBoundary(boundaries, contract.expiresAt, params.period)
  }
  for (const grant of params.grants) {
    addBoundary(boundaries, grant.validFrom, params.period)
    addBoundary(boundaries, grant.validUntil, params.period)
  }
  const ordered = [...boundaries].sort((a, b) => a - b)
  const grantRemaining = new Map(params.grants.map((grant) => [grant.id, grant.units]))
  const periodDuration = params.period.end.getTime() - params.period.start.getTime()
  const result: CalculatedEntitlementSegment[] = []

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const segmentStart = new Date(ordered[index]!)
    const segmentEnd = new Date(ordered[index + 1]!)
    const contract = [...params.contracts]
      .filter(
        (candidate) =>
          candidate.effectiveAt <= segmentStart &&
          (!candidate.expiresAt || candidate.expiresAt > segmentStart)
      )
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0]
    if (!contract) continue

    const usedUnits = sum(
      params.usage
        .filter((entry) => entry.timestamp >= segmentStart && entry.timestamp < segmentEnd)
        .map((entry) => entry.units)
    )
    const includedUnits = proratedUnits(
      contract.includedMonthlyUnits,
      segmentStart,
      segmentEnd,
      params.period,
      periodDuration
    )
    let uncoveredUnits = Math.max(0, usedUnits - includedUnits)
    let grantedUnits = 0
    const activeGrants = params.grants.filter(
      (grant) => grant.validFrom < segmentEnd && grant.validUntil > segmentStart
    )
    for (const grant of activeGrants) {
      const remaining = grantRemaining.get(grant.id) ?? 0
      const applied = Math.min(remaining, uncoveredUnits)
      if (applied <= 0) continue
      grantRemaining.set(grant.id, remaining - applied)
      grantedUnits += applied
      uncoveredUnits -= applied
    }

    const hardSpendCapCents =
      contract.hardMonthlySpendCapCents === null
        ? null
        : proratedUnits(
            contract.hardMonthlySpendCapCents,
            segmentStart,
            segmentEnd,
            params.period,
            periodDuration
          )
    const maximumOverageUnits = calculateMaximumOverageUnits({
      overageEnabled: contract.overageEnabled,
      overageUnitPriceMicros: contract.overageUnitPriceMicros,
      hardMonthlySpendCapCents: hardSpendCapCents,
    })
    const overageUnits = Math.min(uncoveredUnits, maximumOverageUnits)
    result.push({
      contractId: contract.id,
      segmentStart,
      segmentEnd,
      includedUnits,
      grantedUnits,
      usedUnits,
      overageUnits,
      overageUnitPriceMicros: contract.overageUnitPriceMicros,
      hardSpendCapCents,
      overageAmountMicros: overageUnits * (contract.overageUnitPriceMicros ?? 0),
      currency: normalizeHistoricalCurrency(contract.currency),
    })
  }
  return result
}

function proratedUnits(
  monthlyValue: number,
  start: Date,
  end: Date,
  period: MonthlyUsagePeriod,
  duration: number
) {
  const startOffset = start.getTime() - period.start.getTime()
  const endOffset = end.getTime() - period.start.getTime()
  return (
    Math.floor((monthlyValue * endOffset) / duration) -
    Math.floor((monthlyValue * startOffset) / duration)
  )
}

function addBoundary(boundaries: Set<number>, value: Date, period: MonthlyUsagePeriod) {
  const timestamp = value.getTime()
  if (timestamp > period.start.getTime() && timestamp < period.end.getTime()) {
    boundaries.add(timestamp)
  }
}

function normalizeHistoricalCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'XXX'
}

function previousMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
}

function periodKey(start: Date) {
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}
