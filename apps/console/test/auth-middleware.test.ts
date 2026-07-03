import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AUTH_ENV_KEYS = [
  'NEXT_PUBLIC_AUTH_ORIGIN',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_API_URL',
  'AUTH_INTERNAL_ORIGIN',
] as const

const originalEnv = Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  vi.resetModules()
  process.env.NEXT_PUBLIC_AUTH_ORIGIN = 'https://api.planisfy.localhost'
  process.env.NEXT_PUBLIC_APP_URL = 'https://console.planisfy.localhost'
  process.env.NEXT_PUBLIC_API_URL = 'https://api.planisfy.localhost'
  delete process.env.AUTH_INTERNAL_ORIGIN
})

afterEach(() => {
  vi.resetModules()
  for (const key of AUTH_ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function loadMiddleware() {
  return import('../proxy')
}

describe('Console auth middleware helpers', () => {
  it('keeps sign-in redirects on the console app when auth is hosted by the API', async () => {
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = 'https://api.planisfy.localhost'
    process.env.NEXT_PUBLIC_APP_URL = 'https://console.planisfy.localhost'

    const { buildSignInRedirectURL } = await loadMiddleware()
    const redirect = buildSignInRedirectURL(
      'https://console.planisfy.localhost/styles',
      'https://console.planisfy.localhost'
    )

    expect(redirect.toString()).toBe(
      'https://console.planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fstyles'
    )
  })

  it('uses the public app URL as the canonical callback origin', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://console.planisfy.localhost'

    const { buildSignInRedirectURL, getConsoleAppOrigin } = await loadMiddleware()

    expect(getConsoleAppOrigin('https://localhost:4404')).toBe('https://console.planisfy.localhost')

    const redirect = buildSignInRedirectURL(
      'https://localhost:4404/platform?tab=checks#summary',
      'https://localhost:4404'
    )

    expect(redirect.toString()).toBe(
      'https://console.planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fplatform%3Ftab%3Dchecks%23summary'
    )
  })

  it('uses the configured canonical console origin', async () => {
    const { getConsoleAuthOrigin, getSessionBaseURL } = await loadMiddleware()

    expect(getConsoleAuthOrigin('https://localhost:4404')).toBe('https://api.planisfy.localhost')
    expect(getSessionBaseURL('https://localhost:4404')).toBe('https://api.planisfy.localhost')
  })

  it('uses an internal auth origin for server-side session checks', async () => {
    process.env.AUTH_INTERNAL_ORIGIN = 'http://localhost:3000'

    const {
      buildSignInRedirectURL,
      getConsoleAuthOrigin,
      getConsoleAuthFetchOrigin,
      getSessionBaseURL,
    } = await loadMiddleware()

    expect(getConsoleAuthOrigin('https://localhost:4404')).toBe('https://api.planisfy.localhost')
    expect(getConsoleAuthFetchOrigin('https://localhost:4404')).toBe('http://localhost:3000')
    expect(getSessionBaseURL('https://localhost:4404')).toBe('http://localhost:3000')

    const redirect = buildSignInRedirectURL(
      'https://localhost:4404/styles',
      'https://localhost:4404'
    )

    expect(redirect.toString()).toBe(
      'https://console.planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fstyles'
    )
  })

  it('protects onboarding routes with the auth proxy', async () => {
    const { config } = await loadMiddleware()

    expect(config.matcher).toContain('/onboarding/:path*')
  })
})
