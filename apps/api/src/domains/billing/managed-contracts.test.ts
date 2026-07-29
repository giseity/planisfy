import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateEntitlementSegments, calculateMaximumOverageUnits } from './managed-contracts'

test('managed overage converts a hard currency cap into request units', () => {
  assert.equal(
    calculateMaximumOverageUnits({
      overageEnabled: true,
      overageUnitPriceMicros: 2_000,
      hardMonthlySpendCapCents: 500,
    }),
    2_500
  )
})

test('managed overage fails closed without both price and spend cap', () => {
  assert.equal(
    calculateMaximumOverageUnits({
      overageEnabled: true,
      overageUnitPriceMicros: null,
      hardMonthlySpendCapCents: 500,
    }),
    0
  )
  assert.equal(
    calculateMaximumOverageUnits({
      overageEnabled: false,
      overageUnitPriceMicros: 2_000,
      hardMonthlySpendCapCents: 500,
    }),
    0
  )
})

test('reconciliation prorates contract intervals and preserves their currencies', () => {
  const period = {
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2026-08-01T00:00:00.000Z'),
    key: '2026-07',
  }
  const segments = calculateEntitlementSegments({
    period,
    contracts: [
      contract({
        id: 'old',
        includedMonthlyUnits: 1_000,
        currency: 'USD',
        effectiveAt: period.start,
        expiresAt: new Date('2026-07-16T00:00:00.000Z'),
      }),
      contract({
        id: 'new',
        includedMonthlyUnits: 2_000,
        currency: 'EUR',
        effectiveAt: new Date('2026-07-16T00:00:00.000Z'),
        expiresAt: null,
      }),
    ],
    grants: [],
    usage: [
      { timestamp: new Date('2026-07-10T00:00:00.000Z'), units: 600 },
      { timestamp: new Date('2026-07-20T00:00:00.000Z'), units: 1_200 },
    ],
  })

  assert.deepEqual(
    segments.map((segment) => ({
      contractId: segment.contractId,
      includedUnits: segment.includedUnits,
      usedUnits: segment.usedUnits,
      currency: segment.currency,
    })),
    [
      { contractId: 'old', includedUnits: 483, usedUnits: 600, currency: 'USD' },
      { contractId: 'new', includedUnits: 1_033, usedUnits: 1_200, currency: 'EUR' },
    ]
  )
})

test('a temporary allowance is consumed once and only while valid', () => {
  const period = {
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2026-08-01T00:00:00.000Z'),
    key: '2026-07',
  }
  const segments = calculateEntitlementSegments({
    period,
    contracts: [
      contract({
        id: 'contract',
        includedMonthlyUnits: 0,
        effectiveAt: period.start,
        expiresAt: null,
      }),
    ],
    grants: [
      grant({
        id: 'grant',
        units: 100,
        validFrom: new Date('2026-07-10T00:00:00.000Z'),
        validUntil: new Date('2026-07-20T00:00:00.000Z'),
      }),
    ],
    usage: [
      { timestamp: new Date('2026-07-05T00:00:00.000Z'), units: 20 },
      { timestamp: new Date('2026-07-12T00:00:00.000Z'), units: 70 },
      { timestamp: new Date('2026-07-18T00:00:00.000Z'), units: 60 },
      { timestamp: new Date('2026-07-25T00:00:00.000Z'), units: 20 },
    ],
  })

  assert.equal(
    segments.reduce((total, segment) => total + segment.grantedUnits, 0),
    100
  )
  assert.equal(segments[0]?.grantedUnits, 0)
  assert.equal(segments.at(-1)?.grantedUnits, 0)
})

function contract(
  overrides: Partial<Parameters<typeof calculateEntitlementSegments>[0]['contracts'][number]> = {}
) {
  return {
    id: 'contract',
    accountId: 'account',
    planId: 'platform',
    status: 'ACTIVE',
    includedMonthlyUnits: 1_000,
    overageEnabled: true,
    overageUnitPriceMicros: 10,
    hardMonthlySpendCapCents: 100_000,
    currency: 'USD',
    providerSubscriptionId: null,
    effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: null,
    assignedByAccountId: null,
    assignmentReason: 'test',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  }
}

function grant(
  overrides: Partial<Parameters<typeof calculateEntitlementSegments>[0]['grants'][number]> = {}
) {
  return {
    id: 'grant',
    accountId: 'account',
    units: 100,
    validFrom: new Date('2026-07-10T00:00:00.000Z'),
    validUntil: new Date('2026-07-20T00:00:00.000Z'),
    reason: 'test',
    idempotencyKey: 'grant-idempotency-key',
    grantedByAccountId: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  }
}
