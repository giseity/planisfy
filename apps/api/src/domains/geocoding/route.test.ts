import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBatchGeocodingRequest } from './route'

test('batch geocoding validates and normalizes forward and reverse queries', () => {
  const parsed = parseBatchGeocodingRequest({
    queries: [
      { type: 'forward', q: 'Lagos', limit: 500 },
      { type: 'reverse', lon: 3.3792, lat: 6.5244 },
    ],
  })

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.queries, [
    { type: 'forward', q: 'Lagos', limit: 25, language: 'en' },
    {
      type: 'reverse',
      lon: 3.3792,
      lat: 6.5244,
      limit: 1,
      language: 'en',
    },
  ])
})

test('batch geocoding rejects empty, oversized, and invalid queries', () => {
  assert.equal(parseBatchGeocodingRequest({ queries: [] }).ok, false)
  assert.equal(
    parseBatchGeocodingRequest({
      queries: Array.from({ length: 51 }, () => ({
        type: 'forward',
        q: 'Lagos',
      })),
    }).ok,
    false
  )
  assert.equal(
    parseBatchGeocodingRequest({
      queries: [{ type: 'reverse', lon: 181, lat: 0 }],
    }).ok,
    false
  )
})
