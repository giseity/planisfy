import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateMaximumOverageUnits } from './managed-contracts'

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
