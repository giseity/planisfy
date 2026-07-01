import { afterEach, describe, expect, it } from 'vitest'
import { buildTrustedOrigins, getAuthTrustedOrigins } from '../src/env'

const AUTH_ORIGIN_ENV_KEYS = [
  'NEXT_PUBLIC_AUTH_ORIGIN',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_CONSOLE_URL',
  'NEXT_PUBLIC_ADMIN_URL',
  'NEXT_PUBLIC_MARKETING_URL',
  'OAUTH_PROXY_ORIGIN',
] as const

const originalEnv = Object.fromEntries(AUTH_ORIGIN_ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of AUTH_ORIGIN_ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('auth trusted origins', () => {
  it('normalizes and deduplicates origin URLs', () => {
    expect(
      buildTrustedOrigins(
        'https://planisfy.com/api/auth',
        'https://planisfy.com',
        'https://console.planisfy.com/styles',
        undefined
      )
    ).toEqual(['https://planisfy.com', 'https://console.planisfy.com'])
  })

  it('trusts the managed console origin when auth is hosted by marketing', () => {
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = 'https://planisfy.com'
    process.env.NEXT_PUBLIC_CONSOLE_URL = 'https://console.planisfy.com'
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_ADMIN_URL
    delete process.env.NEXT_PUBLIC_MARKETING_URL
    delete process.env.OAUTH_PROXY_ORIGIN

    expect(getAuthTrustedOrigins()).toEqual([
      'https://planisfy.com',
      'https://console.planisfy.com',
    ])
  })

  it('keeps self-host same-origin auth callbacks unchanged', () => {
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = 'http://localhost:3001'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001'
    process.env.NEXT_PUBLIC_CONSOLE_URL = 'http://localhost:3001'
    process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3003'
    process.env.NEXT_PUBLIC_MARKETING_URL = 'http://localhost:3000'
    process.env.OAUTH_PROXY_ORIGIN = 'http://localhost:4000'

    expect(getAuthTrustedOrigins()).toEqual([
      'http://localhost:3001',
      'http://localhost:4000',
      'http://localhost:3003',
      'http://localhost:3000',
    ])
  })
})
