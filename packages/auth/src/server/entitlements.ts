import { APIError } from 'better-auth'
import { subscriptions, db } from '@planisfy/database'
import { normalizePlanSlug, planIncludesFeature, type PlanFeature } from '@planisfy/types'
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { getDeploymentMode } from './env'

export async function requireAccountFeature(accountId: string, feature: PlanFeature) {
  if (getDeploymentMode() === 'self_host') return

  const [subscription] = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        eq(subscriptions.status, 'ACTIVE'),
        or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, new Date()))
      )
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1)
  const plan = normalizePlanSlug(subscription?.planId) ?? 'free'
  if (planIncludesFeature(plan, feature)) return

  throw new APIError('PAYMENT_REQUIRED', {
    code: 'PLAN_UPGRADE_REQUIRED',
    message: `The ${feature} feature is not included in the ${plan} plan.`,
    requiredFeature: feature,
    plan,
  })
}
