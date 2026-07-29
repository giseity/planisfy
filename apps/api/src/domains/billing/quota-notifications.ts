import {
  accounts,
  db,
  eventOutbox,
  members,
  quotaNotificationDeliveries,
  userPreferences,
  users,
} from '@planisfy/database'
import { parseEventPayload } from '@planisfy/events'
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import {
  isQuotaEmailDeliveryConfigured,
  sendQuotaWarningEmail,
} from '../email/email'

const MAX_DELIVERY_ATTEMPTS = 5
const DELIVERY_LEASE_MS = 5 * 60_000

interface QuotaRecipient {
  userId: string
  email: string
  name: string
}

export async function processQuotaNotificationEvents(
  params: { now?: Date; limit?: number } = {}
) {
  const now = params.now ?? new Date()
  if (!isQuotaEmailDeliveryConfigured()) {
    return { configured: false, events: 0, sent: 0, failed: 0 }
  }

  const events = await db
    .select()
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.eventName, 'quota.warning.requested'),
        eq(eventOutbox.status, 'PENDING'),
        lte(eventOutbox.processAt, now)
      )
    )
    .orderBy(asc(eventOutbox.processAt), asc(eventOutbox.createdAt))
    .limit(params.limit ?? 25)

  let sent = 0
  let failed = 0

  for (const event of events) {
    await db
      .update(eventOutbox)
      .set({
        attempts: sql<number>`${eventOutbox.attempts} + 1`,
        updatedAt: now,
      })
      .where(and(eq(eventOutbox.id, event.id), eq(eventOutbox.status, 'PENDING')))

    const payload = parseEventPayload('quota.warning.requested', event.payload)
    const recipients = await resolveQuotaRecipients(payload.accountId)

    if (recipients.length > 0) {
      await db
        .insert(quotaNotificationDeliveries)
        .values(
          recipients.map((recipient) => ({
            outboxEventId: event.id,
            accountId: payload.accountId,
            userId: recipient.userId,
          }))
        )
        .onConflictDoNothing()
    }

    const deliveries = await claimQuotaDeliveries(event.id, now)
    const recipientsByUserId = new Map(
      recipients.map((recipient) => [recipient.userId, recipient])
    )

    for (const delivery of deliveries) {
      const recipient = recipientsByUserId.get(delivery.userId)
      try {
        if (!recipient) {
          await db
            .update(quotaNotificationDeliveries)
            .set({
              status: 'SKIPPED',
              leaseUntil: null,
              lastError: 'Recipient opted out or is no longer eligible',
              updatedAt: now,
            })
            .where(eq(quotaNotificationDeliveries.id, delivery.id))
          continue
        }
        const delivered = await sendQuotaWarningEmail({
          email: recipient.email,
          name: recipient.name,
          usedUnits: payload.usedUnits,
          totalUnits: payload.totalUnits,
          percentUsed: payload.percentUsed,
        })
        if (!delivered) {
          throw new Error('Quota notification provider rejected the message')
        }
        await db
          .update(quotaNotificationDeliveries)
          .set({
            status: 'SENT',
            sentAt: now,
            leaseUntil: null,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(quotaNotificationDeliveries.id, delivery.id))
        sent += 1
      } catch (error) {
        await db
          .update(quotaNotificationDeliveries)
          .set({
            status: 'FAILED',
            nextAttemptAt: new Date(now.getTime() + deliveryRetryDelayMs(delivery.attempts)),
            leaseUntil: null,
            lastError: errorMessage(error),
            updatedAt: now,
          })
          .where(eq(quotaNotificationDeliveries.id, delivery.id))
        failed += 1
      }
    }

    const states = await db
      .select({
        status: quotaNotificationDeliveries.status,
        attempts: quotaNotificationDeliveries.attempts,
      })
      .from(quotaNotificationDeliveries)
      .where(eq(quotaNotificationDeliveries.outboxEventId, event.id))

    if (
      states.length === 0 ||
      states.every((delivery) => ['SENT', 'SKIPPED'].includes(delivery.status))
    ) {
      await db
        .update(eventOutbox)
        .set({
          status: 'COMPLETED',
          lastError: null,
          updatedAt: now,
        })
        .where(eq(eventOutbox.id, event.id))
    } else if (
      states.some(
        (delivery) =>
          delivery.status === 'FAILED' && delivery.attempts >= MAX_DELIVERY_ATTEMPTS
      )
    ) {
      await db
        .update(eventOutbox)
        .set({
          status: 'FAILED',
          lastError: 'One or more quota notification recipients exhausted delivery retries',
          updatedAt: now,
        })
        .where(eq(eventOutbox.id, event.id))
    } else {
      await db
        .update(eventOutbox)
        .set({
          processAt: new Date(now.getTime() + 60_000),
          updatedAt: now,
        })
        .where(eq(eventOutbox.id, event.id))
    }
  }

  return { configured: true, events: events.length, sent, failed }
}

async function claimQuotaDeliveries(outboxEventId: string, now: Date) {
  const due = await db
    .select({ id: quotaNotificationDeliveries.id })
    .from(quotaNotificationDeliveries)
    .where(
      and(
        eq(quotaNotificationDeliveries.outboxEventId, outboxEventId),
        lt(quotaNotificationDeliveries.attempts, MAX_DELIVERY_ATTEMPTS),
        or(
          and(
            inArray(quotaNotificationDeliveries.status, ['PENDING', 'FAILED']),
            lte(quotaNotificationDeliveries.nextAttemptAt, now)
          ),
          and(
            eq(quotaNotificationDeliveries.status, 'PROCESSING'),
            lte(quotaNotificationDeliveries.leaseUntil, now)
          )
        )
      )
    )
    .orderBy(asc(quotaNotificationDeliveries.nextAttemptAt))

  const claimed = []
  for (const row of due) {
    const [delivery] = await db
      .update(quotaNotificationDeliveries)
      .set({
        status: 'PROCESSING',
        attempts: sql<number>`${quotaNotificationDeliveries.attempts} + 1`,
        leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
        updatedAt: now,
      })
      .where(
        and(
          eq(quotaNotificationDeliveries.id, row.id),
          or(
            and(
              inArray(quotaNotificationDeliveries.status, ['PENDING', 'FAILED']),
              lte(quotaNotificationDeliveries.nextAttemptAt, now)
            ),
            and(
              eq(quotaNotificationDeliveries.status, 'PROCESSING'),
              lte(quotaNotificationDeliveries.leaseUntil, now)
            )
          )
        )
      )
      .returning()
    if (delivery) claimed.push(delivery)
  }
  return claimed
}

async function resolveQuotaRecipients(accountId: string): Promise<QuotaRecipient[]> {
  const [account] = await db
    .select({ type: accounts.type })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!account) return []
  if (account.type === 'USER') {
    const recipient = await resolveQuotaRecipient(accountId)
    return recipient ? [recipient] : []
  }

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      emailNotificationsEnabled: userPreferences.emailNotificationsEnabled,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(
      and(
        eq(members.organizationId, accountId),
        inArray(members.role, ['owner', 'admin'])
      )
    )

  return rows
    .filter((row) => row.emailNotificationsEnabled !== false)
    .map(({ userId, email, name }) => ({ userId, email, name }))
}

async function resolveQuotaRecipient(userId: string): Promise<QuotaRecipient | null> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      emailNotificationsEnabled: userPreferences.emailNotificationsEnabled,
    })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(userPreferences.emailNotificationsEnabled),
          eq(userPreferences.emailNotificationsEnabled, true)
        )
      )
    )
    .limit(1)

  return row
    ? {
        userId: row.userId,
        email: row.email,
        name: row.name,
      }
    : null
}

export function deliveryRetryDelayMs(attempt: number) {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1))
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000)
}
