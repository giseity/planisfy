'use server'

import { revalidatePath } from 'next/cache'
import { auditEvents, db, managedContracts, plans, usageAllowanceGrants } from '@planisfy/database'
import { PLANS, normalizePlanSlug } from '@planisfy/types'
import { and, eq, sql } from 'drizzle-orm'
import { requirePlatformPermission } from '@/features/auth/admin-auth'

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(formData: FormData, key: string, maximum: number) {
  const value = Number(stringValue(formData, key))
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}`)
  }
  return value
}

function nonNegativeInteger(formData: FormData, key: string, maximum: number) {
  const value = Number(stringValue(formData, key))
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${key} must be an integer between 0 and ${maximum}`)
  }
  return value
}

export async function assignManagedContractAction(formData: FormData) {
  const admin = await requirePlatformPermission('platform.configuration.manage')
  const accountId = stringValue(formData, 'accountId')
  const planId = normalizePlanSlug(stringValue(formData, 'planId'))
  const assignmentReason = stringValue(formData, 'assignmentReason')
  const includedMonthlyUnits = nonNegativeInteger(formData, 'includedMonthlyUnits', 2_000_000_000)
  const overageEnabled = formData.get('overageEnabled') === 'on'
  const overageUnitPriceMicros = overageEnabled
    ? positiveInteger(formData, 'overageUnitPriceMicros', 2_000_000_000)
    : null
  const hardMonthlySpendCapCents = overageEnabled
    ? nonNegativeInteger(formData, 'hardMonthlySpendCapCents', 2_000_000_000)
    : null

  if (!accountId || !planId || !assignmentReason) {
    throw new Error('Account, plan, and assignment reason are required')
  }

  const plan = PLANS[planId]
  await db.transaction(async (tx) => {
    await tx
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        limits: {
          monthlyUnits: plan.monthlyUnits === Infinity ? null : plan.monthlyUnits,
          requestsPerMinute: plan.requestsPerMinute,
          maxStyles: plan.maxStyles === Infinity ? null : plan.maxStyles,
          maxSources: plan.maxSources === Infinity ? null : plan.maxSources,
          maxApiKeys: plan.maxApiKeys === Infinity ? null : plan.maxApiKeys,
        },
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: { name: plan.name, limits: sql`excluded.limits`, active: true },
      })

    const effectiveAt = new Date()
    await tx
      .update(managedContracts)
      .set({ status: 'SUPERSEDED', expiresAt: effectiveAt })
      .where(and(eq(managedContracts.accountId, accountId), eq(managedContracts.status, 'ACTIVE')))

    const [created] = await tx
      .insert(managedContracts)
      .values({
        accountId,
        planId,
        includedMonthlyUnits,
        overageEnabled,
        overageUnitPriceMicros,
        hardMonthlySpendCapCents,
        currency: stringValue(formData, 'currency') || 'USD',
        providerSubscriptionId: stringValue(formData, 'providerSubscriptionId') || null,
        effectiveAt,
        assignedByAccountId: admin.userId,
        assignmentReason,
      })
      .returning({ id: managedContracts.id })

    await tx.insert(auditEvents).values({
      accountId,
      actorUserId: admin.userId,
      action: 'managed_contract.assigned',
      resourceType: 'managed_contract',
      resourceId: created?.id,
      metadata: {
        accountId,
        planId,
        includedMonthlyUnits,
        overageEnabled,
        overageUnitPriceMicros,
        hardMonthlySpendCapCents,
        assignmentReason,
      },
    })
  })

  revalidatePath('/billing-contracts')
}

export async function grantUsageAllowanceAction(formData: FormData) {
  const admin = await requirePlatformPermission('platform.configuration.manage')
  const accountId = stringValue(formData, 'accountId')
  const reason = stringValue(formData, 'reason')
  const idempotencyKey = stringValue(formData, 'idempotencyKey')
  const units = positiveInteger(formData, 'units', 2_000_000_000)
  const validityDays = positiveInteger(formData, 'validityDays', 366)
  if (!accountId || !reason || !idempotencyKey) {
    throw new Error('Account, reason, and idempotency key are required')
  }

  const validFrom = new Date()
  const validUntil = new Date(validFrom.getTime() + validityDays * 24 * 60 * 60 * 1000)
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(usageAllowanceGrants)
      .values({
        accountId,
        units,
        validFrom,
        validUntil,
        reason,
        idempotencyKey,
        grantedByAccountId: admin.userId,
      })
      .onConflictDoNothing({
        target: [usageAllowanceGrants.accountId, usageAllowanceGrants.idempotencyKey],
      })
      .returning({ id: usageAllowanceGrants.id })

    if (created) {
      await tx.insert(auditEvents).values({
        accountId,
        actorUserId: admin.userId,
        action: 'usage_allowance.granted',
        resourceType: 'usage_allowance_grant',
        resourceId: created.id,
        metadata: {
          accountId,
          units,
          validUntil: validUntil.toISOString(),
          reason,
          idempotencyKey,
        },
      })
    }
  })

  revalidatePath('/billing-contracts')
}
