import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canApplyActivationTransition,
  canApplyBuildTransition,
  isTerminalBuildStatus,
} from './protocol'

test('build transitions move forward and terminal states are monotonic', () => {
  assert.equal(
    canApplyBuildTransition({
      kind: 'routing',
      current: 'downloading_source',
      next: 'building_tiles',
    }),
    true
  )
  assert.equal(
    canApplyBuildTransition({
      kind: 'routing',
      current: 'building_tiles',
      next: 'preparing',
    }),
    false
  )
  assert.equal(
    canApplyBuildTransition({ kind: 'basemap', current: 'uploading', next: 'succeeded' }),
    true
  )
  assert.equal(
    canApplyBuildTransition({ kind: 'basemap', current: 'succeeded', next: 'uploading' }),
    false
  )
  assert.equal(
    canApplyBuildTransition({ kind: 'basemap', current: 'succeeded', next: 'failed' }),
    false
  )
  assert.equal(
    canApplyBuildTransition({ kind: 'basemap', current: 'succeeded', next: 'succeeded' }),
    true
  )
  assert.equal(isTerminalBuildStatus('canceled'), true)
})

test('activation completion is first-writer-wins and idempotent', () => {
  assert.equal(canApplyActivationTransition('activating', 'active'), true)
  assert.equal(canApplyActivationTransition('activating', 'failed'), true)
  assert.equal(canApplyActivationTransition('active', 'active'), true)
  assert.equal(canApplyActivationTransition('failed', 'failed'), true)
  assert.equal(canApplyActivationTransition('active', 'failed'), false)
  assert.equal(canApplyActivationTransition('failed', 'active'), false)
})
