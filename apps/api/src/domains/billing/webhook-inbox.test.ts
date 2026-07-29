import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dodoWebhookFailureTransition,
  isDodoWebhookClaimDue,
  parseDodoEventTimestamp,
  shouldReplayDodoWebhook,
} from './webhook-inbox'

test('webhook ordering prefers the provider payload occurrence timestamp', () => {
  assert.equal(
    parseDodoEventTimestamp({ timestamp: '2026-07-20T10:00:00.000Z' }, '1784545200')?.toISOString(),
    '2026-07-20T10:00:00.000Z'
  )
})

test('webhook timestamp parser accepts signed epoch seconds and rejects malformed values', () => {
  assert.equal(parseDodoEventTimestamp({}, '1784541600')?.toISOString(), '2026-07-20T10:00:00.000Z')
  assert.equal(parseDodoEventTimestamp({}, 'not-a-date'), null)
})

test('interrupted webhook claims become due after their lease expires', () => {
  const now = new Date('2026-07-29T12:00:00.000Z')
  assert.equal(
    isDodoWebhookClaimDue(
      {
        status: 'PROCESSING',
        nextAttemptAt: now,
        leaseUntil: new Date('2026-07-29T11:59:59.000Z'),
      },
      now
    ),
    true
  )
  assert.equal(
    isDodoWebhookClaimDue(
      {
        status: 'PROCESSING',
        nextAttemptAt: now,
        leaseUntil: new Date('2026-07-29T12:00:01.000Z'),
      },
      now
    ),
    false
  )
})

test('failed webhook deliveries back off, exhaust, and can be explicitly replayed', () => {
  const now = new Date('2026-07-29T12:00:00.000Z')
  assert.deepEqual(dodoWebhookFailureTransition(1, now), {
    status: 'PENDING',
    nextAttemptAt: new Date('2026-07-29T12:00:05.000Z'),
  })
  assert.equal(dodoWebhookFailureTransition(8, now).status, 'FAILED')
  assert.equal(shouldReplayDodoWebhook({ status: 'FAILED', processedAt: null }), true)
  assert.equal(
    shouldReplayDodoWebhook({ status: 'PROCESSED', processedAt: now }),
    false
  )
})
