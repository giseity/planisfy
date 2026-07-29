import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeDodoBillingTransactionStatus,
  normalizeDodoSubscriptionStatus,
  subscriptionEventPrecedence,
} from './billing'
import { shouldApplyBillingTransactionEvent } from './billing-transactions'

describe('Dodo billing status normalization', () => {
  it('normalizes payment events to transaction statuses', () => {
    assert.equal(normalizeDodoBillingTransactionStatus('payment.processing', null), 'PENDING')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.succeeded', null), 'PAID')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.failed', null), 'FAILED')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.cancelled', null), 'CANCELED')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.refunded', null), 'REFUNDED')
  })

  it('falls back to raw payment status when event type is ambiguous', () => {
    assert.equal(normalizeDodoBillingTransactionStatus('payment.unknown', 'paid'), 'PAID')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.unknown', 'pending'), 'PENDING')
    assert.equal(normalizeDodoBillingTransactionStatus('payment.unknown', 'strange'), 'UNKNOWN')
  })

  it('normalizes subscription lifecycle statuses without local trials', () => {
    assert.equal(normalizeDodoSubscriptionStatus('subscription.active', null), 'ACTIVE')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.failed', null), 'PAST_DUE')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.paused', null), 'PAST_DUE')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.expired', null), 'CANCELED')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.renewed', null), 'ACTIVE')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.plan_changed', null), 'ACTIVE')
    assert.equal(normalizeDodoSubscriptionStatus('subscription.updated', 'trialing'), 'INACTIVE')
  })
})

describe('Dodo subscription event ordering', () => {
  it('uses fail-closed precedence for equal occurrence timestamps', () => {
    assert.ok(subscriptionEventPrecedence('CANCELED') > subscriptionEventPrecedence('PAST_DUE'))
    assert.ok(subscriptionEventPrecedence('PAST_DUE') > subscriptionEventPrecedence('INACTIVE'))
    assert.ok(subscriptionEventPrecedence('INACTIVE') > subscriptionEventPrecedence('ACTIVE'))
  })
})

describe('Dodo payment event ordering', () => {
  it('rejects delayed events and chooses a terminal state for timestamp ties', () => {
    const currentAt = new Date('2026-07-29T12:00:00.000Z')
    assert.equal(
      shouldApplyBillingTransactionEvent({
        currentAt,
        currentStatus: 'PAID',
        currentId: 'event-paid',
        incomingAt: new Date('2026-07-29T11:59:59.000Z'),
        incomingStatus: 'PENDING',
        incomingId: 'event-delayed',
      }),
      false
    )
    assert.equal(
      shouldApplyBillingTransactionEvent({
        currentAt,
        currentStatus: 'PAID',
        currentId: 'event-paid',
        incomingAt: currentAt,
        incomingStatus: 'REFUNDED',
        incomingId: 'event-refunded',
      }),
      true
    )
    assert.equal(
      shouldApplyBillingTransactionEvent({
        currentAt,
        currentStatus: 'REFUNDED',
        currentId: 'event-refunded',
        incomingAt: currentAt,
        incomingStatus: 'PAID',
        incomingId: 'event-paid',
      }),
      false
    )
  })
})
