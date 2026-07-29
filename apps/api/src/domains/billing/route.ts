import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { Webhook, WebhookVerificationError } from 'standardwebhooks'
import { bodyLimit } from 'hono/body-limit'
import type { AuthEnv } from '../../middleware/auth'
import {
  changeSubscriptionPlan,
  createCheckoutSession,
  createCustomerPortalSession,
  getAccountBillingStatus,
  getAccountPlan,
  getAccountPlanLimits,
  getActivePaidSubscription,
  getPlanDefinition,
  isBillingConfigured,
  isCheckoutConfiguredForPlan,
  listPlanDefinitions,
  serializePlanLimits,
} from './billing'
import { getMonthlyUsagePeriod, getMonthlyUsageUnits } from '../usage/usage-quota'
import { db, styles, tilesets, apiKeys, billingTransactions } from '@planisfy/database'
import { eq, and, isNull, count, desc } from 'drizzle-orm'
import { env } from '../../env'
import { requireOrgPermission } from '../../middleware/auth'
import { acceptDodoWebhookEvent, parseDodoEventTimestamp } from './webhook-inbox'
import {
  beginBillingMutation,
  billingMutationFingerprint,
  BillingMutationError,
  completeBillingMutation,
  failBillingMutation,
  requireIdempotencyKey,
} from './billing-mutations'

const checkoutSchema = z.object({
  planId: z.enum(['starter', 'scale']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
})

const changePlanSchema = checkoutSchema

export const billingRoute = new Hono<AuthEnv>()
export const billingWebhookRoute = new Hono()
export const DODO_WEBHOOK_BODY_LIMIT_BYTES = 256 * 1024
export const dodoWebhookBodyLimit = bodyLimit({
  maxSize: DODO_WEBHOOK_BODY_LIMIT_BYTES,
  onError: (c) =>
    c.json(
      {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Webhook payload exceeds the 256 KiB limit.',
        },
      },
      413
    ),
})

billingRoute.use('/billing', requireOrgPermission('billing.manage'))
billingRoute.use('/billing/*', requireOrgPermission('billing.manage'))

type BillingTransactionRow = typeof billingTransactions.$inferSelect

export function serializeBillingTransaction(row: BillingTransactionRow) {
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    status: row.status,
    providerCheckoutId: row.providerCheckoutId,
    providerOrderId: row.providerOrderId,
    productKey: row.productKey,
    productLabel: row.productLabel,
    amountCents: row.amountCents,
    currency: row.currency,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── GET /billing — Current plan, usage, and limits ──────────────────────────

billingRoute.get('/billing', async (c) => {
  const ownerId = c.get('ownerId')

  const [plan, limits] = await Promise.all([getAccountPlan(ownerId), getAccountPlanLimits(ownerId)])
  const [billingStatus, activeSubscription] = await Promise.all([
    getAccountBillingStatus(ownerId),
    getActivePaidSubscription(ownerId),
  ])

  const period = getMonthlyUsagePeriod()

  const [[styleCount], [tilesetCount], [keyCount], monthlyUnits] = await Promise.all([
    db
      .select({ count: count() })
      .from(styles)
      .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt))),
    db
      .select({ count: count() })
      .from(tilesets)
      .where(and(eq(tilesets.accountId, ownerId), isNull(tilesets.deletedAt))),
    db
      .select({ count: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true))),
    getMonthlyUsageUnits(ownerId, period.start),
  ])

  const planInfo = await getPlanDefinition(plan)
  const serializedLimits = serializePlanLimits(limits)

  return c.json({
    deploymentMode: env.DEPLOYMENT_MODE,
    billingStatus,
    plan,
    planName: planInfo.name,
    price: planInfo.price,
    limits: serializedLimits,
    usage: {
      monthlyUnits,
      styles: styleCount?.count ?? 0,
      sources: tilesetCount?.count ?? 0,
      apiKeys: keyCount?.count ?? 0,
    },
    quotaPercent:
      limits.monthlyUnits === Infinity ? 0 : Math.round((monthlyUnits / limits.monthlyUnits) * 100),
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    billingConfigured: env.DEPLOYMENT_MODE === 'managed' && isBillingConfigured(),
    portalAvailable:
      env.DEPLOYMENT_MODE === 'managed' &&
      isBillingConfigured() &&
      Boolean(activeSubscription?.providerSubscriptionId),
    subscriptionInterval: activeSubscription?.billingInterval ?? null,
  })
})

// ── GET /billing/plans — Available plans ────────────────────────────────────

billingRoute.get('/billing/plans', async (c) => {
  const plans = (await listPlanDefinitions()).map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    price: plan.price,
    priceLabel: plan.priceLabel,
    period: plan.period,
    checkout: plan.checkout,
    checkoutAvailable: env.DEPLOYMENT_MODE === 'managed' && isCheckoutConfiguredForPlan(plan.id),
    pricing: plan.pricing,
    features: plan.features,
    comparison: plan.comparison,
    requestsPerMinute: plan.limits.requestsPerMinute,
    monthlyUnits: plan.limits.monthlyUnits === Infinity ? 'Unlimited' : plan.limits.monthlyUnits,
    maxStyles: plan.limits.maxStyles === Infinity ? 'Unlimited' : plan.limits.maxStyles,
    maxSources: plan.limits.maxSources === Infinity ? 'Unlimited' : plan.limits.maxSources,
    maxApiKeys: plan.limits.maxApiKeys === Infinity ? 'Unlimited' : plan.limits.maxApiKeys,
  }))

  return c.json(plans)
})

// ── GET /billing/transactions — Local Dodo transaction ledger ───────────────

billingRoute.get('/billing/transactions', async (c) => {
  if (env.DEPLOYMENT_MODE === 'self_host') {
    return c.json({ data: [] })
  }

  const ownerId = c.get('ownerId')

  const rows = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.accountId, ownerId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(25)

  return c.json({ data: rows.map(serializeBillingTransaction) })
})

// ── POST /billing/checkout — Create a checkout session ──────────────────────

billingRoute.post('/billing/checkout', async (c) => {
  if (env.DEPLOYMENT_MODE === 'self_host') {
    return c.json(
      {
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          message:
            'Hosted checkout is disabled in self-host mode. Billing is read-only for usage and limits.',
        },
      },
      409
    )
  }

  const userId = c.get('userId')
  const ownerId = c.get('ownerId')
  const body = await c.req.json()
  const { planId, interval } = checkoutSchema.parse(body)
  const clientIp = getClientIp(c)

  let mutation
  try {
    const idempotencyKey = requireIdempotencyKey(c.req.header('idempotency-key'))
    mutation = await beginBillingMutation({
      accountId: ownerId,
      initiatedByAccountId: userId,
      operation: 'checkout',
      idempotencyKey,
      requestFingerprint: billingMutationFingerprint('checkout', { planId, interval }),
      clientIp,
    })
  } catch (error) {
    if (error instanceof BillingMutationError) {
      if (error.retryAfter) c.header('Retry-After', String(error.retryAfter))
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    }
    throw error
  }
  if (mutation.kind === 'replay') return c.json(mutation.body as Record<string, unknown>)

  const activeSubscription = await getActivePaidSubscription(ownerId)
  if (activeSubscription) {
    await failBillingMutation(mutation.id, 'Account already has an active subscription', false)
    return c.json(
      {
        error: {
          code: 'ACTIVE_SUBSCRIPTION',
          message:
            'This account already has an active paid subscription. Manage it in the billing portal.',
        },
      },
      409
    )
  }

  let session
  try {
    session = await createCheckoutSession({
      userId,
      accountId: ownerId,
      planId,
      interval,
      idempotencyKey: c.req.header('idempotency-key'),
    })
  } catch (error) {
    await failBillingMutation(mutation.id, error)
    throw error
  }

  if (!session) {
    await failBillingMutation(mutation.id, 'Billing is not configured', false)
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            'Billing is not configured. Set Dodo Payments credentials and product IDs to enable payments.',
        },
      },
      503
    )
  }

  await completeBillingMutation(mutation.id, 200, session)
  return c.json(session)
})

// ── POST /billing/subscription/change-plan — Upgrade active subscription ────

billingRoute.post('/billing/subscription/change-plan', async (c) => {
  if (env.DEPLOYMENT_MODE === 'self_host') {
    return c.json(
      {
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          message:
            'Hosted subscription changes are disabled in self-host mode. Billing is read-only for usage and limits.',
        },
      },
      409
    )
  }

  const ownerId = c.get('ownerId')
  const userId = c.get('userId')
  const body = await c.req.json()
  const { planId, interval } = changePlanSchema.parse(body)
  const clientIp = getClientIp(c)

  let mutation
  try {
    const idempotencyKey = requireIdempotencyKey(c.req.header('idempotency-key'))
    mutation = await beginBillingMutation({
      accountId: ownerId,
      initiatedByAccountId: userId,
      operation: 'change-plan',
      idempotencyKey,
      requestFingerprint: billingMutationFingerprint('change-plan', { planId, interval }),
      clientIp,
    })
  } catch (error) {
    if (error instanceof BillingMutationError) {
      if (error.retryAfter) c.header('Retry-After', String(error.retryAfter))
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    }
    throw error
  }
  if (mutation.kind === 'replay') return c.json(mutation.body as Record<string, unknown>)

  try {
    const result = await changeSubscriptionPlan({
      accountId: ownerId,
      planId,
      interval,
      idempotencyKey: c.req.header('idempotency-key'),
    })
    if (result.changed) {
      await completeBillingMutation(mutation.id, 200, result)
      return c.json(result)
    }

    if (result.reason === 'no-active-paid-subscription') {
      await failBillingMutation(mutation.id, result.reason, false)
      return c.json(
        {
          error: {
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message: 'No active paid subscription was found.',
          },
        },
        404
      )
    }
    if (result.reason === 'not-dodo-managed') {
      await failBillingMutation(mutation.id, result.reason, false)
      return c.json(
        {
          error: {
            code: 'SUBSCRIPTION_NOT_DODO_MANAGED',
            message: 'This subscription is not managed by Dodo.',
          },
        },
        409
      )
    }
    if (result.reason === 'portal-required') {
      await failBillingMutation(mutation.id, result.reason, false)
      return c.json(
        {
          error: {
            code: 'PORTAL_REQUIRED',
            message: 'Use the billing portal to downgrade or change billing interval.',
          },
        },
        400
      )
    }

    await failBillingMutation(mutation.id, result.reason, false)
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            'Billing is not configured. Set Dodo Payments credentials and product IDs to enable subscription changes.',
        },
      },
      503
    )
  } catch (err) {
    await failBillingMutation(mutation.id, err)
    console.error('Failed to change Dodo subscription plan', {
      err,
      ownerId,
      planId,
      interval,
    })
    return c.json(
      {
        error: {
          code: 'UPSTREAM_BILLING_ERROR',
          message: 'Unable to change subscription plan.',
        },
      },
      502
    )
  }
})

// ── GET/POST /billing/portal — Get customer portal URL ──────────────────────

billingRoute.get('/billing/portal', createBillingPortalResponse)
billingRoute.post('/billing/portal', createBillingPortalResponse)

async function createBillingPortalResponse(c: Context<AuthEnv>) {
  if (env.DEPLOYMENT_MODE === 'self_host') {
    return c.json(
      {
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          message:
            'Hosted billing portal is disabled in self-host mode. Billing is read-only for usage and limits.',
        },
      },
      409
    )
  }

  if (!isBillingConfigured()) {
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Billing portal is not configured.',
        },
      },
      503
    )
  }

  let url: string | null
  try {
    url = await createCustomerPortalSession({
      accountId: c.get('ownerId'),
      userId: c.get('userId'),
      returnUrl: `${env.NEXT_PUBLIC_CONSOLE_URL}/billing`,
    })
  } catch (err) {
    console.error('Failed to create Dodo customer portal session', {
      err,
      ownerId: c.get('ownerId'),
    })
    return c.json(
      {
        error: {
          code: 'UPSTREAM_BILLING_ERROR',
          message: 'Billing portal is unavailable.',
        },
      },
      502
    )
  }

  if (!url) {
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Billing portal is not configured.',
        },
      },
      503
    )
  }

  return c.json({ url })
}

billingWebhookRoute.post('/webhooks/dodo', dodoWebhookBodyLimit, async (c) => {
  if (!env.DODO_PAYMENTS_WEBHOOK_SECRET) {
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Dodo webhook secret is not configured.',
        },
      },
      503
    )
  }

  const rawBody = await c.req.text()
  let payload: unknown

  try {
    const webhook = new Webhook(env.DODO_PAYMENTS_WEBHOOK_SECRET)
    payload = webhook.verify(rawBody, Object.fromEntries(c.req.raw.headers))
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return c.json(
        {
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Invalid webhook signature.',
          },
        },
        401
      )
    }
    throw err
  }

  const webhookId = c.req.header('webhook-id')
  if (!webhookId) {
    return c.json(
      { error: { code: 'MISSING_WEBHOOK_ID', message: 'webhook-id header is required.' } },
      400
    )
  }
  const eventPayload = payload as Record<string, unknown>
  if (!isExpectedDodoWebhookBrand(eventPayload)) {
    return c.json({
      data: {
        applied: false,
        reason: 'brand-mismatch',
        brandId: getDodoWebhookBrandId(eventPayload),
      },
    })
  }

  const result = await acceptDodoWebhookEvent({
    webhookId,
    payload: eventPayload,
    eventAt: parseDodoEventTimestamp(eventPayload, c.req.header('webhook-timestamp')),
  })
  return c.json({ data: { ...result, webhookId } })
})

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function getDodoWebhookBrandId(payload: Record<string, unknown>) {
  return (
    stringValue(payload.brand_id) ??
    stringValue(recordValue(payload.data)?.brand_id) ??
    stringValue(recordValue(payload.payload)?.brand_id)
  )
}

export function isExpectedDodoWebhookBrand(
  payload: Record<string, unknown>,
  expectedBrandId = env.DODO_PAYMENTS_BRAND_ID
) {
  if (!expectedBrandId) return true
  return getDodoWebhookBrandId(payload) === expectedBrandId
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getClientIp(c: Context<AuthEnv>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
  )
}
