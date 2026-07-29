import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleDispatchUrl } from './job-client'

test('scheduleDispatchUrl targets the bounded internal scheduler endpoint', () => {
  assert.equal(
    scheduleDispatchUrl('http://api:4000/', 25),
    'http://api:4000/internal/operations/jobs/schedules?limit=25'
  )
})
