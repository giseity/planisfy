import assert from 'node:assert/strict'
import test from 'node:test'
import {
  directionsRoute,
  parseCoords,
  selectIndexedCoordinates,
  validateCoordinateList,
  validateMatrixWorkload,
} from './route'

test('parseCoords and validateCoordinateList reject malformed or excessive routes', () => {
  assert.deepEqual(parseCoords('0,1;2,3'), [
    { lon: 0, lat: 1 },
    { lon: 2, lat: 3 },
  ])

  assert.equal(
    validateCoordinateList(parseCoords('0,1'), { min: 2, max: 25 }),
    'At least 2 coordinates required'
  )
  assert.equal(
    validateCoordinateList(parseCoords('bad,1;2,3'), { min: 2, max: 25 }),
    'Coordinates must be valid longitude,latitude pairs'
  )
  assert.equal(
    validateCoordinateList(
      Array.from({ length: 26 }, (_, index) => ({
        lon: index,
        lat: index,
      })),
      { min: 2, max: 25 }
    ),
    'At most 25 coordinates allowed'
  )
})

test('matrix workload validation bounds indexed coordinate selections', () => {
  const points = parseCoords('0,0;1,1;2,2;3,3')

  assert.deepEqual(selectIndexedCoordinates(points, '0;2'), [
    { lon: 0, lat: 0 },
    { lon: 2, lat: 2 },
  ])
  assert.equal(selectIndexedCoordinates(points, '0;9'), null)

  assert.equal(
    validateMatrixWorkload(
      Array.from({ length: 10 }, () => ({ lon: 0, lat: 0 })),
      Array.from({ length: 11 }, () => ({ lon: 1, lat: 1 }))
    ),
    'At most 100 matrix cells allowed'
  )
})

test('POST matrix rejects workloads above the shared cell limit', async () => {
  const response = await directionsRoute.request('/matrix/v1/driving', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sources: Array.from({ length: 10 }, () => ({ lon: 0, lat: 0 })),
      targets: Array.from({ length: 11 }, () => ({ lon: 1, lat: 1 })),
    }),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'BAD_REQUEST')
})

test('POST isochrone rejects more than four contours', async () => {
  const response = await directionsRoute.request('/isochrone/v1/walking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lon: 0, lat: 0 }],
      contours: [5, 10, 15, 20, 25].map((time) => ({ time })),
    }),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'BAD_REQUEST')
})

test('POST directions exposes alternatives and translates it for Valhalla', async () => {
  const originalFetch = globalThis.fetch
  let valhallaBody: Record<string, unknown> | undefined
  globalThis.fetch = (async (_input, init) => {
    valhallaBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ trip: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const response = await directionsRoute.request('/directions/v1/driving', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 1 },
        ],
        alternatives: 2,
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(valhallaBody?.alternates, 2)
    assert.equal('alternatives' in (valhallaBody ?? {}), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST directions rejects the removed alternates field', async () => {
  const response = await directionsRoute.request('/directions/v1/driving', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 1 },
      ],
      alternates: 2,
    }),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'BAD_REQUEST')
})
