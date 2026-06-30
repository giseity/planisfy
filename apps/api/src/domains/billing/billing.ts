import { billingCustomers, db, plans, accounts, subscriptions, users } from '@planisfy/database'
import {
  PLANS,
  normalizePlanSlug,
  type BillingInterval,
  type PlanDefinition,
  type PlanLimits,
  type PlanSlug,
} from '@planisfy/types'
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { env } from '../../env'
import { recordDodoBillingTransaction } from './billing-transactions'
import {
  isCheckoutPlan,
  lookupSubscriptionProduct,
  resolveSubscriptionProduct,
  type BillablePlanSlug,
  type SubscriptionProduct,
} from './subscription-products'

export { PLANS }
export type { PlanLimits, PlanSlug }

export type AccountBillingStatus =
  | 'configured'
  | 'checkout_unavailable'
  | 'active_subscription'
  | 'past_due'
  | 'canceled'
  | 'free_plan'
  | 'self_hosted'
type SerializedPlanLimits = {
  monthlyUnits: number | null
  requestsPerMinute: number
  maxStyles: number | null
  maxSources: number | null
  maxApiKeys: number | null
}

export interface RuntimePlanDefinition {
  id: PlanSlug
  productId: string
  name: string
  price: number
  priceLabel: string
  period: string
  checkout: boolean
  pricing: PlanDefinition['pricing']
  features: string[]
  comparison: PlanDefinition['comparison']
  limits: PlanLimits
}

interface DodoCheckoutResponse {
  checkout_url?: string
  checkoutUrl?: string
  session_id?: string
  sessionId?: string
  id?: string
}

interface DodoCustomerResponse {
  customer_id?: string
  customerId?: string
  id?: string
  email?: string
  metadata?: Record<string, unknown>
}

interface DodoCustomerPortalResponse {
  link?: string
  url?: string
}

export interface CheckoutSession {
  url: string
  checkoutId: string | null
}

export interface ActivePaidSubscription {
  id: string
  planId: PlanSlug
  providerSubscriptionId: string | null
}

interface DodoWebhookPayload {
  type?: string
  event_type?: string
  timestamp?: string
  data?: Record<string, unknown>
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface DodoWebhookContext {
  webhookId?: string | null
  webhookTimestamp?: string | null
}

export const DODO_PAYMENT_WEBHOOK_EVENTS = [
  'payment.processing',
  'payment.succeeded',
  'payment.failed',
  'payment.cancelled',
  'payment.canceled',
  'payment.refunded',
] as const

export const DODO_SUBSCRIPTION_WEBHOOK_EVENTS = [
  'subscription.active',
  'subscription.updated',
  'subscription.renewed',
  'subscription.plan_changed',
  'subscription.on_hold',
  'subscription.paused',
  'subscription.failed',
  'subscription.cancelled',
  'subscription.canceled',
  'subscription.expired',
] as const

export function serializePlanLimits(limits: PlanLimits): SerializedPlanLimits {
  return {
    monthlyUnits: limits.monthlyUnits === Infinity ? null : limits.monthlyUnits,
    requestsPerMinute: limits.requestsPerMinute,
    maxStyles: limits.maxStyles === Infinity ? null : limits.maxStyles,
    maxSources: limits.maxSources === Infinity ? null : limits.maxSources,
    maxApiKeys: limits.maxApiKeys === Infinity ? null : limits.maxApiKeys,
  }
}

export function isBillingConfigured(): boolean {
  return Boolean(
    env.DODO_PAYMENTS_API_KEY &&
    env.DODO_PAYMENTS_WEBHOOK_SECRET &&
    (env.DODO_STARTER_MONTHLY_PRODUCT_ID || env.DODO_PRO_PRODUCT_ID)
  )
}

export function isCheckoutConfiguredForPlan(planId: PlanSlug): boolean {
  return (
    isCheckoutPlan(planId) &&
    Boolean(env.DODO_PAYMENTS_API_KEY && resolveSubscriptionProduct(planId))
  )
}

export async function ensureBillingPlans() {
  const values = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    limits: serializePlanLimits(plan),
    active: true,
  }))

  await db
    .insert(plans)
    .values(values)
    .onConflictDoUpdate({
      target: plans.id,
      set: {
        name: sql`excluded.name`,
        limits: sql`excluded.limits`,
        active: true,
      },
    })

  await db
    .update(plans)
    .set({ active: false })
    .where(sql`${plans.id} in ('pro', 'enterprise')`)
}

export async function listPlanDefinitions(): Promise<RuntimePlanDefinition[]> {
  const rows = await db.select().from(plans).where(eq(plans.active, true))

  return Object.values(PLANS).map((fallback) => {
    const row = rows.find((candidate) => candidate.id === fallback.id)
    return {
      id: fallback.id,
      productId: fallback.productId,
      name: row?.name ?? fallback.name,
      price: fallback.price,
      priceLabel: fallback.priceLabel,
      period: fallback.period,
      checkout: fallback.checkout,
      pricing: fallback.pricing,
      features: fallback.features,
      comparison: fallback.comparison,
      limits: row ? parseStoredPlanLimits(row.limits, fallback) : fallback,
    }
  })
}

export async function getPlanDefinition(planId: PlanSlug): Promise<RuntimePlanDefinition> {
  const definitions = await listPlanDefinitions()
  return (
    definitions.find((definition) => definition.id === planId) ?? {
      id: PLANS.free.id,
      productId: PLANS.free.productId,
      name: PLANS.free.name,
      price: PLANS.free.price,
      priceLabel: PLANS.free.priceLabel,
      period: PLANS.free.period,
      checkout: PLANS.free.checkout,
      pricing: PLANS.free.pricing,
      features: PLANS.free.features,
      comparison: PLANS.free.comparison,
      limits: PLANS.free,
    }
  )
}

export async function getAccountPlan(accountId: string): Promise<PlanSlug> {
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
    })
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

  return normalizePlanSlug(subscription?.planId) ?? 'free'
}

export async function getActivePaidSubscription(
  accountId: string
): Promise<ActivePaidSubscription | null> {
  const [subscription] = await db
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
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

  const planId = normalizePlanSlug(subscription?.planId)
  if (!subscription || !planId || planId === 'free') return null

  return {
    id: subscription.id,
    planId,
    providerSubscriptionId: subscription.providerSubscriptionId,
  }
}

export async function getAccountBillingStatus(accountId: string): Promise<AccountBillingStatus> {
  if (env.DEPLOYMENT_MODE === 'self_host') return 'self_hosted'

  const [subscription] = await db
    .select({
      status: subscriptions.status,
      planId: subscriptions.planId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1)

  if (!subscription || subscription.planId === 'free') {
    return isBillingConfigured() ? 'free_plan' : 'checkout_unavailable'
  }

  if (subscription.status === 'ACTIVE') return 'active_subscription'
  if (subscription.status === 'PAST_DUE') return 'past_due'
  if (subscription.status === 'CANCELED') return 'canceled'
  return isBillingConfigured() ? 'configured' : 'checkout_unavailable'
}

export async function getUserPlan(userId: string): Promise<PlanSlug> {
  return getAccountPlan(userId)
}

export async function getAccountPlanLimits(accountId: string): Promise<PlanLimits> {
  const plan = await getAccountPlan(accountId)
  return (await getPlanDefinition(plan)).limits
}

export async function getPlanLimits(accountId: string): Promise<PlanLimits> {
  return getAccountPlanLimits(accountId)
}

export async function createCheckoutSession(params: {
  userId: string
  accountId: string
  planId: BillablePlanSlug
  interval?: BillingInterval
}): Promise<CheckoutSession | null> {
  const interval = params.interval ?? 'monthly'
  const product = resolveSubscriptionProduct(params.planId, interval)
  if (!env.DODO_PAYMENTS_API_KEY || !product) return null

  await ensureBillingPlans()

  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
      displayName: accounts.displayName,
    })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.id))
    .where(eq(users.id, params.userId))
    .limit(1)

  if (!user?.email) {
    throw new Error('Cannot create checkout without a user email')
  }

  const body = {
    customer: {
      email: user.email,
      name: user.name || user.displayName || user.email,
    },
    product_cart: [{ product_id: product.dodoProductId, quantity: 1 }],
    return_url: `${env.NEXT_PUBLIC_CONSOLE_URL}/billing?billing=success`,
    cancel_url: `${env.NEXT_PUBLIC_CONSOLE_URL}/billing?billing=cancelled`,
    metadata: {
      userId: params.userId,
      accountId: params.accountId,
      planId: params.planId,
      interval,
    },
  }

  const data = await dodoFetch<DodoCheckoutResponse>('/checkouts', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  const url = data.checkout_url ?? data.checkoutUrl
  if (!url) {
    throw new Error('Dodo checkout response did not include a checkout URL')
  }

  const checkoutId = data.session_id ?? data.sessionId ?? data.id ?? null

  await recordDodoBillingTransaction({
    accountId: params.accountId,
    initiatedByAccountId: params.userId,
    type: 'SUBSCRIPTION',
    status: 'CHECKOUT_CREATED',
    providerCheckoutId: checkoutId,
    providerOrderId: null,
    providerCustomerId: null,
    providerCustomerExternalId: params.accountId,
    providerProductId: product.dodoProductId,
    productKey: product.productKey,
    productLabel: product.productLabel,
    metadata: {
      planId: params.planId,
      interval,
      productId: product.dodoProductId,
      userId: params.userId,
    },
  })

  return { url, checkoutId }
}

export async function createCheckoutUrl(
  userId: string,
  planId: BillablePlanSlug,
  accountId = userId,
  interval: BillingInterval = 'monthly'
): Promise<string | null> {
  const session = await createCheckoutSession({
    userId,
    accountId,
    planId,
    interval,
  })
  return session?.url ?? null
}

export async function createCustomerPortalSession(params: {
  accountId: string
  userId: string
  returnUrl?: string
}): Promise<string | null> {
  if (!env.DODO_PAYMENTS_API_KEY) return null

  const customerId = await getOrCreateDodoCustomerId({
    accountId: params.accountId,
    userId: params.userId,
  })
  if (!customerId) return null

  const query = new URLSearchParams()
  if (params.returnUrl) query.set('return_url', params.returnUrl)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const session = await dodoFetch<DodoCustomerPortalResponse>(
    `/customers/${encodeURIComponent(customerId)}/customer-portal/session${suffix}`,
    { method: 'POST' }
  )
  const url = session.link ?? session.url
  if (!url) {
    throw new Error('Dodo customer portal response did not include a URL')
  }
  return url
}

export async function reportUsage(): Promise<void> {
  // Dodo subscription usage metering is not wired yet. Keep request logging as
  // the source of truth for Planisfy quotas.
}

export async function applyDodoWebhookEvent(
  payload: DodoWebhookPayload,
  context: DodoWebhookContext = {}
) {
  await ensureBillingPlans()

  const eventType = payload.type ?? payload.event_type ?? 'unknown'
  const data = isRecord(payload.data)
    ? payload.data
    : isRecord(payload.payload)
      ? payload.payload
      : {}
  const metadata = readMetadata(payload, data)
  const accountId = readAccountId(metadata, data)
  const product = readSubscriptionProduct(metadata, data)

  if (!accountId || !product) {
    return { applied: false, reason: 'missing-account-or-plan', eventType }
  }

  const customerId = readFirstString(data, [
    'customer_id',
    'customerId',
    'customer.customer_id',
    'customer.customerId',
    'customer.id',
  ])
  const checkoutId = readFirstString(data, [
    'checkout_id',
    'checkoutId',
    'checkout_session_id',
    'checkoutSessionId',
    'checkout.session_id',
    'checkout.sessionId',
    'session_id',
  ])
  const orderId = readFirstString(data, ['order_id', 'orderId', 'payment_id', 'paymentId', 'id'])

  if (customerId) {
    await upsertDodoCustomerMapping({
      accountId,
      providerCustomerId: customerId,
      email: stringValue(readFirst(data, ['customer.email', 'email'])),
      metadata: data,
    })
  }

  if (isPaymentEvent(eventType)) {
    const status = normalizeDodoBillingTransactionStatus(eventType, stringValue(data.status))
    await recordDodoBillingTransaction({
      accountId,
      type: 'SUBSCRIPTION',
      status,
      providerCheckoutId: checkoutId,
      providerOrderId: orderId,
      providerCustomerId: customerId,
      providerCustomerExternalId: accountId,
      providerProductId: product.dodoProductId,
      productKey: product.productKey,
      productLabel: product.productLabel,
      amountCents: getNumber(data, 'total_amount', 'totalAmount', 'amount'),
      currency: stringValue(readFirst(data, ['currency'])),
      metadata: data,
      webhookId: context.webhookId ?? null,
      webhookType: eventType,
      webhookAt: parseWebhookTimestamp(context.webhookTimestamp ?? payload.timestamp),
    })

    return {
      applied: true,
      eventType,
      accountId,
      planId: product.planId,
      status,
      subscriptionId: null,
    }
  }

  if (!isSubscriptionEvent(eventType)) {
    return { applied: false, reason: 'ignored-event-type', eventType }
  }

  const subscriptionId = readFirstString(data, [
    'subscription_id',
    'subscriptionId',
    'subscription.id',
    'id',
  ])
  const status = normalizeDodoSubscriptionStatus(eventType, stringValue(data.status))
  const periodStart = dateValue(
    readFirst(data, [
      'current_period_start',
      'currentPeriodStart',
      'previous_billing_date',
      'previousBillingDate',
    ])
  )
  const periodEnd = dateValue(
    readFirst(data, [
      'current_period_end',
      'currentPeriodEnd',
      'next_billing_date',
      'nextBillingDate',
    ])
  )

  if (subscriptionId) {
    await db
      .insert(subscriptions)
      .values({
        accountId,
        planId: product.planId,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        providerSubscriptionId: subscriptionId,
      })
      .onConflictDoUpdate({
        target: subscriptions.providerSubscriptionId,
        set: {
          accountId,
          planId: product.planId,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      })
  } else {
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.accountId, accountId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1)

    if (existing) {
      await db
        .update(subscriptions)
        .set({
          planId: product.planId,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing.id))
    } else {
      await db.insert(subscriptions).values({
        accountId,
        planId: product.planId,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        providerSubscriptionId: null,
      })
    }
  }

  return {
    applied: true,
    eventType,
    accountId,
    planId: product.planId,
    status,
    subscriptionId,
  }
}

function getDodoApiUrl(): string {
  if (!env.DODO_PAYMENTS_API_URL) {
    throw new Error('DODO_PAYMENTS_API_URL is required when billing is enabled.')
  }
  return env.DODO_PAYMENTS_API_URL.replace(/\/$/, '')
}

async function dodoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = env.DODO_PAYMENTS_API_KEY
  if (!token) throw new Error('DODO_PAYMENTS_API_KEY not configured')

  const res = await fetch(`${getDodoApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dodo API error: ${res.status} ${body}`)
  }

  return res.json() as Promise<T>
}

async function getOrCreateDodoCustomerId(params: {
  accountId: string
  userId: string
}): Promise<string | null> {
  const [existing] = await db
    .select({
      providerCustomerId: billingCustomers.providerCustomerId,
    })
    .from(billingCustomers)
    .where(
      and(eq(billingCustomers.accountId, params.accountId), eq(billingCustomers.provider, 'DODO'))
    )
    .limit(1)

  if (existing?.providerCustomerId) return existing.providerCustomerId

  const [identity] = await db
    .select({
      email: users.email,
      userName: users.name,
      accountName: accounts.displayName,
    })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, params.accountId))
    .where(eq(users.id, params.userId))
    .limit(1)

  const email = identity?.email
  if (!email) {
    throw new Error('Cannot create Dodo customer without a user email')
  }

  const customer = await dodoFetch<DodoCustomerResponse>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      name: identity.accountName || identity.userName || email,
      metadata: {
        accountId: params.accountId,
        userId: params.userId,
      },
    }),
  })
  const providerCustomerId = customer.customer_id ?? customer.customerId ?? customer.id
  if (!providerCustomerId) {
    throw new Error('Dodo customer response did not include a customer ID')
  }

  await upsertDodoCustomerMapping({
    accountId: params.accountId,
    providerCustomerId,
    email: customer.email ?? email,
    metadata: customer.metadata ?? {
      accountId: params.accountId,
      userId: params.userId,
    },
  })

  return providerCustomerId
}

function parseStoredPlanLimits(value: unknown, fallback: PlanDefinition): PlanLimits {
  if (!isRecord(value)) return fallback

  return {
    monthlyUnits: numericLimit(value.monthlyUnits, fallback.monthlyUnits),
    requestsPerMinute: numericLimit(value.requestsPerMinute, fallback.requestsPerMinute),
    maxStyles: numericLimit(value.maxStyles, fallback.maxStyles),
    maxSources: numericLimit(value.maxSources, fallback.maxSources),
    maxApiKeys: numericLimit(value.maxApiKeys, fallback.maxApiKeys),
  }
}

function numericLimit(value: unknown, fallback: number): number {
  if (value === null || value === 'Unlimited' || value === 'unlimited') {
    return Infinity
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return fallback
}

async function upsertDodoCustomerMapping(input: {
  accountId: string
  providerCustomerId: string
  email?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  await db
    .insert(billingCustomers)
    .values({
      accountId: input.accountId,
      provider: 'DODO',
      providerCustomerId: input.providerCustomerId,
      email: input.email ?? null,
      metadata: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [billingCustomers.accountId, billingCustomers.provider],
      set: {
        providerCustomerId: input.providerCustomerId,
        email: input.email ?? null,
        metadata: input.metadata ?? null,
      },
    })
}

function readAccountId(
  metadata: Record<string, unknown>,
  data: Record<string, unknown>
): string | null {
  const direct = stringValue(metadata.accountId) ?? stringValue(metadata.account_id)
  if (direct) return direct

  const customer = readFirst(data, ['customer'])
  const customerMetadata =
    isRecord(customer) && isRecord(customer.metadata) ? customer.metadata : {}
  return stringValue(customerMetadata.accountId) ?? stringValue(customerMetadata.account_id)
}

function readSubscriptionProduct(
  metadata: Record<string, unknown>,
  data: Record<string, unknown>
): SubscriptionProduct | null {
  const metadataPlan = normalizePlanSlug(stringValue(metadata.planId))
  const metadataInterval = billingIntervalValue(metadata.interval) ?? 'monthly'
  if (metadataPlan === 'starter' || metadataPlan === 'scale') {
    const product = resolveSubscriptionProduct(metadataPlan, metadataInterval)
    if (product) return product
  }

  const productId = readFirstString(data, [
    'product_id',
    'productId',
    'product.product_id',
    'product.id',
    'product_cart.0.product_id',
    'productCart.0.productId',
  ])
  return productId ? lookupSubscriptionProduct(productId) : null
}

function billingIntervalValue(value: unknown): BillingInterval | null {
  return value === 'monthly' || value === 'yearly' ? value : null
}

function isPaymentEvent(eventType: string): boolean {
  return (DODO_PAYMENT_WEBHOOK_EVENTS as readonly string[]).includes(eventType)
}

function isSubscriptionEvent(eventType: string): boolean {
  return (DODO_SUBSCRIPTION_WEBHOOK_EVENTS as readonly string[]).includes(eventType)
}

export function normalizeDodoBillingTransactionStatus(
  eventType: string,
  rawStatus: string | null
): 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'UNKNOWN' {
  if (eventType === 'payment.succeeded') return 'PAID'
  if (eventType === 'payment.processing') return 'PENDING'
  if (eventType === 'payment.failed') return 'FAILED'
  if (eventType === 'payment.cancelled' || eventType === 'payment.canceled') {
    return 'CANCELED'
  }
  if (eventType === 'payment.refunded') return 'REFUNDED'

  const status = rawStatus?.toLowerCase()
  if (status === 'succeeded' || status === 'paid') return 'PAID'
  if (status === 'processing' || status === 'pending') return 'PENDING'
  if (status === 'failed') return 'FAILED'
  if (status === 'cancelled' || status === 'canceled') return 'CANCELED'
  if (status === 'refunded') return 'REFUNDED'
  return 'UNKNOWN'
}

function readMetadata(
  payload: DodoWebhookPayload,
  data: Record<string, unknown>
): Record<string, unknown> {
  const direct = payload.metadata ?? data.metadata
  return isRecord(direct) ? direct : {}
}

export function normalizeDodoSubscriptionStatus(
  eventType: string,
  rawStatus: string | null
): 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INACTIVE' {
  const status = `${eventType} ${rawStatus ?? ''}`.toLowerCase()
  if (status.includes('trial')) return 'INACTIVE'
  if (status.includes('cancel') || status.includes('expired')) {
    return 'CANCELED'
  }
  if (
    status.includes('past_due') ||
    status.includes('failed') ||
    status.includes('unpaid') ||
    status.includes('on_hold') ||
    status.includes('paused')
  ) {
    return 'PAST_DUE'
  }
  if (
    status.includes('active') ||
    status.includes('renewed') ||
    status.includes('plan_changed') ||
    status.includes('success')
  ) {
    return 'ACTIVE'
  }
  return 'INACTIVE'
}

function readFirstString(data: Record<string, unknown>, paths: string[]): string | null {
  return stringValue(readFirst(data, paths))
}

function readFirst(data: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(data, path)
    if (value !== undefined && value !== null) return value
  }
}

function readPath(data: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = data
  for (const segment of path.split('.')) {
    if (Array.isArray(cursor)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      cursor = cursor[index]
    } else {
      if (!isRecord(cursor)) return undefined
      cursor = cursor[segment]
    }
  }
  return cursor
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getNumber(data: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = readPath(data, key)
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseWebhookTimestamp(timestamp: string | null | undefined): Date | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
