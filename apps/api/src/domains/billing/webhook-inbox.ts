import { billingWebhookEvents, db } from '@planisfy/database'
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { applyDodoWebhookEvent } from './billing'

const WEBHOOK_LEASE_MS = 2 * 60 * 1000
const WEBHOOK_RETRY_DELAYS_MS = [
  0,
  5_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  5 * 60 * 60_000,
  10 * 60 * 60_000,
  10 * 60 * 60_000,
] as const

export async function acceptDodoWebhookEvent(params: {
  webhookId: string
  payload: Record<string, unknown>
  eventAt: Date | null
}) {
  const [inserted] = await db
    .insert(billingWebhookEvents)
    .values({
      provider: 'DODO',
      webhookId: params.webhookId,
      eventType: stringValue(params.payload.type) ?? stringValue(params.payload.event_type),
      payload: params.payload,
      eventAt: params.eventAt,
      status: 'PENDING',
      nextAttemptAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: billingWebhookEvents.id })
  if (inserted) return { accepted: true, duplicate: false }

  const [existing] = await db
    .select({
      status: billingWebhookEvents.status,
      processedAt: billingWebhookEvents.processedAt,
    })
    .from(billingWebhookEvents)
    .where(
      and(
        eq(billingWebhookEvents.provider, 'DODO'),
        eq(billingWebhookEvents.webhookId, params.webhookId)
      )
    )
    .limit(1)
  if (!existing || existing.processedAt || existing.status === 'PROCESSED') {
    return { accepted: true, duplicate: true }
  }

  if (shouldReplayDodoWebhook(existing)) {
    await db
      .update(billingWebhookEvents)
      .set({
        payload: params.payload,
        eventType: stringValue(params.payload.type) ?? stringValue(params.payload.event_type),
        eventAt: params.eventAt,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingWebhookEvents.provider, 'DODO'),
          eq(billingWebhookEvents.webhookId, params.webhookId),
          eq(billingWebhookEvents.status, 'FAILED')
        )
      )
    return { accepted: true, duplicate: false, replayed: true }
  }

  return { accepted: true, duplicate: true }
}

export async function processDueDodoWebhookEvents(
  params: {
    now?: Date
    limit?: number
  } = {}
) {
  const now = params.now ?? new Date()
  const due = await db
    .select({ id: billingWebhookEvents.id })
    .from(billingWebhookEvents)
    .where(
      or(
        and(
          eq(billingWebhookEvents.status, 'PENDING'),
          lte(billingWebhookEvents.nextAttemptAt, now)
        ),
        and(
          eq(billingWebhookEvents.status, 'PROCESSING'),
          or(isNull(billingWebhookEvents.leaseUntil), lte(billingWebhookEvents.leaseUntil, now))
        )
      )
    )
    .orderBy(asc(billingWebhookEvents.nextAttemptAt), asc(billingWebhookEvents.receivedAt))
    .limit(params.limit ?? 25)
  if (due.length === 0) return { claimed: 0, processed: 0, failed: 0 }

  const claimed = await db
    .update(billingWebhookEvents)
    .set({
      status: 'PROCESSING',
      attempts: sql<number>`${billingWebhookEvents.attempts} + 1`,
      leaseUntil: new Date(now.getTime() + WEBHOOK_LEASE_MS),
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          billingWebhookEvents.id,
          due.map((event) => event.id)
        ),
        or(
          eq(billingWebhookEvents.status, 'PENDING'),
          and(
            eq(billingWebhookEvents.status, 'PROCESSING'),
            or(isNull(billingWebhookEvents.leaseUntil), lte(billingWebhookEvents.leaseUntil, now))
          )
        )
      )
    )
    .returning()

  let processed = 0
  let failed = 0
  for (const event of claimed) {
    try {
      const payload = recordValue(event.payload)
      if (!payload) throw new Error('Stored webhook payload is not an object')
      const result = await applyDodoWebhookEvent(payload, {
        webhookId: event.webhookId,
        webhookTimestamp: event.eventAt?.toISOString() ?? null,
      })
      await db
        .update(billingWebhookEvents)
        .set({
          status: 'PROCESSED',
          result,
          processedAt: new Date(),
          leaseUntil: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(billingWebhookEvents.id, event.id), eq(billingWebhookEvents.status, 'PROCESSING'))
        )
      processed += 1
    } catch (error) {
      const retry = dodoWebhookFailureTransition(event.attempts, new Date())
      await db
        .update(billingWebhookEvents)
        .set({
          status: retry.status,
          nextAttemptAt: retry.nextAttemptAt,
          leaseUntil: null,
          lastError: errorMessage(error),
          updatedAt: new Date(),
        })
        .where(eq(billingWebhookEvents.id, event.id))
      failed += 1
    }
  }
  return { claimed: claimed.length, processed, failed }
}

export function shouldReplayDodoWebhook(existing: {
  status: string
  processedAt: Date | null
}) {
  return existing.status === 'FAILED' && !existing.processedAt
}

export function isDodoWebhookClaimDue(
  event: {
    status: string
    nextAttemptAt: Date
    leaseUntil: Date | null
  },
  now: Date
) {
  if (event.status === 'PENDING') return event.nextAttemptAt <= now
  return event.status === 'PROCESSING' && (!event.leaseUntil || event.leaseUntil <= now)
}

export function dodoWebhookFailureTransition(attempts: number, now: Date) {
  const exhausted = attempts >= WEBHOOK_RETRY_DELAYS_MS.length
  const retryDelay =
    WEBHOOK_RETRY_DELAYS_MS[Math.min(attempts, WEBHOOK_RETRY_DELAYS_MS.length - 1)]!
  return {
    status: exhausted ? ('FAILED' as const) : ('PENDING' as const),
    nextAttemptAt: new Date(now.getTime() + retryDelay),
  }
}

export function parseDodoEventTimestamp(
  payload: Record<string, unknown>,
  signedTimestamp: string | null | undefined
) {
  const payloadTimestamp = stringValue(payload.timestamp)
  const candidate = payloadTimestamp ?? signedTimestamp
  if (!candidate) return null
  const numeric = Number(candidate)
  const parsed =
    Number.isFinite(numeric) && /^\d+$/.test(candidate)
      ? new Date(numeric * 1000)
      : new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 2_000)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
