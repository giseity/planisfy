import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { billingJobUrl } from './job-client'

describe('billingJobUrl', () => {
  it('targets the internal billing scheduler endpoint', () => {
    assert.equal(
      billingJobUrl('http://api:3000/', 'reconcile'),
      'http://api:3000/internal/billing/jobs/reconcile'
    )
  })

  it('targets the durable quota notification job', () => {
    assert.equal(
      billingJobUrl('http://api:3000', 'notifications'),
      'http://api:3000/internal/billing/jobs/notifications'
    )
  })
})
