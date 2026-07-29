import assert from 'node:assert/strict'
import test from 'node:test'
import { executeBillingJob } from './jobs'

test('billing scheduler dispatches reconciliation with the scheduled timestamp', async () => {
  const now = new Date('2026-07-29T12:00:00.000Z')
  const calls: Date[] = []

  const result = await executeBillingJob('reconcile', now, {
    reconcile: async (scheduledAt) => {
      calls.push(scheduledAt)
      return [{ id: 'current' }, null, { id: 'previous' }]
    },
    cleanup: async () => undefined,
    webhooks: async () => ({ claimed: 0, processed: 0, failed: 0 }),
  })

  assert.deepEqual(calls, [now])
  assert.deepEqual(result, { periods: 2 })
})
