import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateApiKeyPolicy,
  getEndpointCategory,
  getEndpointCost,
  getPostEndpointCost,
  isRequestOriginAllowed,
  normalizeAllowedDomains,
  requiredScopeForPath,
} from './api-key'

test('normalizes API key allowed domains', () => {
  const result = normalizeAllowedDomains([
    ' HTTPS://Example.COM ',
    '*.Example.com',
    'example.com',
    'bad/path',
    '',
  ])

  assert.deepEqual(result.domains, ['example.com', '*.example.com'])
  assert.deepEqual(result.errors, ['bad/path', ''])
})

test('checks API key request origins against exact and wildcard domains', () => {
  assert.equal(isRequestOriginAllowed('https://app.example.com', ['*.example.com']), true)
  assert.equal(isRequestOriginAllowed('https://example.com', ['*.example.com']), true)
  assert.equal(isRequestOriginAllowed('https://evil-example.com', ['*.example.com']), false)
  assert.equal(
    isRequestOriginAllowed('https://console.planisfy.com/path', ['console.planisfy.com']),
    true
  )
})

test('domain restricted API keys require a valid origin', () => {
  assert.equal(isRequestOriginAllowed(undefined, ['example.com']), false)
  assert.equal(isRequestOriginAllowed('not a url', ['example.com']), false)
  assert.equal(isRequestOriginAllowed(undefined, []), true)
})

test('required scopes map public API paths', () => {
  assert.equal(requiredScopeForPath('/tiles/v1/main/0/0/0.pbf'), 'tiles:read')
  assert.equal(requiredScopeForPath('/v4/acme.roads/tilequery/-73.9,40.7.json'), 'tiles:read')
  assert.equal(requiredScopeForPath('/styles/v1/demo/basic'), 'styles:read')
  assert.equal(requiredScopeForPath('/directions/v1/driving'), 'directions')
})

test('authorization decisions use the supplied live scopes and origin policy', () => {
  const stalePolicy = evaluateApiKeyPolicy({
    permissions: { scopes: ['directions'] },
    metadata: { allowedDomains: ['old.example.com'] },
    path: '/directions/v1/driving',
    origin: 'https://old.example.com',
  })
  assert.equal(stalePolicy.allowed, true)

  const liveScopePolicy = evaluateApiKeyPolicy({
    permissions: { scopes: ['tiles:read'] },
    metadata: { allowedDomains: ['old.example.com'] },
    path: '/directions/v1/driving',
    origin: 'https://old.example.com',
  })
  assert.deepEqual(liveScopePolicy, {
    allowed: false,
    status: 403,
    code: 'SCOPE_DENIED',
    message: 'API key missing required scope: directions',
  })

  const liveDomainPolicy = evaluateApiKeyPolicy({
    permissions: { scopes: ['directions'] },
    metadata: { allowedDomains: ['new.example.com'] },
    path: '/directions/v1/driving',
    origin: 'https://old.example.com',
  })
  assert.equal(liveDomainPolicy.allowed, false)
  if (!liveDomainPolicy.allowed) {
    assert.equal(liveDomainPolicy.code, 'DOMAIN_NOT_ALLOWED')
  }
})

test('endpoint category and cost classify tilequery', () => {
  const path = '/v4/acme.roads/tilequery/-73.9,40.7.json'

  assert.equal(getEndpointCategory(path), 'tilequery')
  assert.equal(getEndpointCost(path), 10)
})

test('endpoint cost scales bounded routing workloads', () => {
  assert.equal(getEndpointCost('/directions/v1/driving/0,0;1,1;2,2'), 11)
  assert.equal(getEndpointCost('/matrix/v1/driving/0,0;1,1;2,2;3,3'), 12)
  assert.equal(getEndpointCost('/optimized-trips/v1/driving/0,0;1,1;2,2;3,3'), 17)
})

test('POST endpoint cost uses body workload instead of the coordinate-free path', () => {
  assert.equal(
    getPostEndpointCost('/directions/v1/driving', {
      locations: Array.from({ length: 25 }, () => ({ lon: 0, lat: 0 })),
    }),
    33
  )
  assert.equal(
    getPostEndpointCost('/matching/v1/driving', {
      shape: Array.from({ length: 100 }, () => ({ lon: 0, lat: 0 })),
    }),
    14
  )
  assert.equal(
    getPostEndpointCost('/matrix/v1/driving', {
      sources: Array.from({ length: 10 }, () => ({ lon: 0, lat: 0 })),
      targets: Array.from({ length: 10 }, () => ({ lon: 0, lat: 0 })),
    }),
    20
  )
  assert.equal(
    getPostEndpointCost('/geocoding/v1/batch', {
      queries: Array.from({ length: 50 }, () => ({ type: 'forward' })),
    }),
    250
  )
})
