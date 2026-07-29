import { billingSchedulerState, db } from '@planisfy/database'
import { sql } from 'drizzle-orm'
import {
  deleteExpiredBillableRequests,
  reconcileOpenManagedUsagePeriods,
} from './managed-contracts'
import { processDueDodoWebhookEvents } from './webhook-inbox'
import { processQuotaNotificationEvents } from './quota-notifications'

export type BillingJobName = 'reconcile' | 'cleanup' | 'webhooks' | 'notifications'

type BillingJobHandlers = {
  reconcile: (now: Date) => Promise<readonly unknown[]>
  cleanup: (now: Date) => Promise<unknown>
  webhooks: (params: { now: Date; limit: number }) => Promise<unknown>
  notifications: (params: { now: Date; limit: number }) => Promise<unknown>
}

const defaultHandlers: BillingJobHandlers = {
  reconcile: reconcileOpenManagedUsagePeriods,
  cleanup: deleteExpiredBillableRequests,
  webhooks: processDueDodoWebhookEvents,
  notifications: processQuotaNotificationEvents,
}

export async function executeBillingJob(
  jobName: BillingJobName,
  now: Date,
  handlers: BillingJobHandlers = defaultHandlers
) {
  if (jobName === 'reconcile') {
    const rows = await handlers.reconcile(now)
    return { periods: rows.filter(Boolean).length }
  }
  if (jobName === 'cleanup') {
    await handlers.cleanup(now)
    return { cleaned: true }
  }
  if (jobName === 'notifications') {
    return handlers.notifications({ now, limit: 25 })
  }
  return handlers.webhooks({ now, limit: 25 })
}

export async function runBillingJob(jobName: BillingJobName, now = new Date()) {
  const startedAt = new Date()
  await db
    .insert(billingSchedulerState)
    .values({ jobName, lastStartedAt: startedAt, updatedAt: startedAt })
    .onConflictDoUpdate({
      target: billingSchedulerState.jobName,
      set: { lastStartedAt: startedAt, updatedAt: startedAt },
    })

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billingJob:${jobName}`}))`)
      return executeBillingJob(jobName, now)
    })
    const finishedAt = new Date()
    await db
      .insert(billingSchedulerState)
      .values({
        jobName,
        lastStartedAt: startedAt,
        lastSucceededAt: finishedAt,
        lastDurationMs: finishedAt.getTime() - startedAt.getTime(),
        lastResult: result,
        lastError: null,
        updatedAt: finishedAt,
      })
      .onConflictDoUpdate({
        target: billingSchedulerState.jobName,
        set: {
          lastSucceededAt: finishedAt,
          lastDurationMs: finishedAt.getTime() - startedAt.getTime(),
          lastResult: result,
          lastError: null,
          updatedAt: finishedAt,
        },
      })
    return result
  } catch (error) {
    const failedAt = new Date()
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000)
    await db
      .insert(billingSchedulerState)
      .values({
        jobName,
        lastStartedAt: startedAt,
        lastFailedAt: failedAt,
        lastDurationMs: failedAt.getTime() - startedAt.getTime(),
        lastError: message,
        updatedAt: failedAt,
      })
      .onConflictDoUpdate({
        target: billingSchedulerState.jobName,
        set: {
          lastFailedAt: failedAt,
          lastDurationMs: failedAt.getTime() - startedAt.getTime(),
          lastError: message,
          updatedAt: failedAt,
        },
      })
    throw error
  }
}
