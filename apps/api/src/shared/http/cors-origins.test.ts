import assert from 'node:assert/strict'
import test from 'node:test'
import { apiCorsOrigins } from './cors-origins'

test('apiCorsOrigins includes configured public ingress origins', () => {
  const origins = apiCorsOrigins({
    apiUrl: 'https://api.staging.planisfy.example',
    consoleUrl: 'https://console.staging.planisfy.example',
    adminUrl: 'https://admin.staging.planisfy.example',
    marketingUrl: 'https://www.staging.planisfy.example',
    docsUrl: 'https://docs.staging.planisfy.example',
  })

  assert.ok(origins.includes('https://api.staging.planisfy.example'))
  assert.ok(origins.includes('https://console.staging.planisfy.example'))
  assert.ok(origins.includes('https://admin.staging.planisfy.example'))
  assert.ok(origins.includes('https://www.staging.planisfy.example'))
  assert.ok(origins.includes('https://docs.staging.planisfy.example'))
})
