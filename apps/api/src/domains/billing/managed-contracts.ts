import {
  billableRequests,
  db,
  managedContracts,
  usageAllowanceGrants,
  usageBillingPeriods,
} from '@planisfy/database'
import { PLANS, normalizePlanSlug, type PlanLimits, type PlanSlug } from '@planisfy/types'
import { and, desc, eq, gt, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'
import {
  getMonthlyUsagePeriod,
  getMonthlyUsageUnits,
  type MonthlyUsagePeriod,
} from '../usage/usage-quota'

const MICROS_PER_CENT = 10_000

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
        currency: assignment.currency ?? 'USD',
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
}) {
  const period = params.period ?? getMonthlyUsagePeriod()
  const entitlement = await getManagedContractEntitlement(params.accountId, period.start)
  if (!entitlement) return null

  const usedUnits = await getMonthlyUsageUnits(params.accountId, period.start, period.end)
  const allowance = entitlement.includedUnits + entitlement.grantedUnits
  const overageUnits = Math.max(0, usedUnits - allowance)
  const overageAmountMicros = overageUnits * (entitlement.overageUnitPriceMicros ?? 0)

  const [row] = await db
    .insert(usageBillingPeriods)
    .values({
      accountId: params.accountId,
      periodStart: period.start,
      periodEnd: period.end,
      includedUnits: entitlement.includedUnits,
      grantedUnits: entitlement.grantedUnits,
      usedUnits,
      overageUnits,
      overageAmountMicros,
      reconciledAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [usageBillingPeriods.accountId, usageBillingPeriods.periodStart],
      set: {
        periodEnd: period.end,
        includedUnits: entitlement.includedUnits,
        grantedUnits: entitlement.grantedUnits,
        usedUnits,
        overageUnits,
        overageAmountMicros,
        reconciledAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

export async function reconcileOpenManagedUsagePeriods(now = new Date()) {
  const contracts = await db
    .selectDistinct({ accountId: managedContracts.accountId })
    .from(managedContracts)
    .where(
      and(
        eq(managedContracts.status, 'ACTIVE'),
        lte(managedContracts.effectiveAt, now),
        or(isNull(managedContracts.expiresAt), gt(managedContracts.expiresAt, now))
      )
    )

  return Promise.all(contracts.map(({ accountId }) => reconcileManagedUsagePeriod({ accountId })))
}

export async function deleteExpiredBillableRequests(now = new Date(), retentionDays = 7) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  await db.delete(billableRequests).where(lt(billableRequests.createdAt, cutoff))
}

function validateManagedContractAssignment(assignment: ManagedContractAssignment) {
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
