import assert from 'node:assert/strict'
import test from 'node:test'
import {
  billingMutationFingerprint,
  BillingMutationError,
  requireIdempotencyKey,
} from './billing-mutations'

test('billing mutation fingerprints are stable and operation scoped', () => {
  const body = { planId: 'starter', interval: 'monthly' }
  assert.equal(
    billingMutationFingerprint('checkout', body),
    billingMutationFingerprint('checkout', body)
  )
  assert.notEqual(
    billingMutationFingerprint('checkout', body),
    billingMutationFingerprint('change-plan', body)
  )
})

test('billing mutation idempotency keys enforce the public contract', () => {
  assert.equal(requireIdempotencyKey('billing:checkout:1234'), 'billing:checkout:1234')
  assert.throws(
    () => requireIdempotencyKey('short'),
    (error) => error instanceof BillingMutationError && error.code === 'IDEMPOTENCY_KEY_REQUIRED'
  )
})
