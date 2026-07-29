import { describe, expect, it } from 'vitest'
import {
  buildThemeCookieWrites,
  parseThemeCookie,
  sharedCookieDomain,
} from './theme-cookie'

describe('theme cookie helpers', () => {
  it.each([
    ['console.example.com', '.example.com'],
    ['console.example.co.uk', '.example.co.uk'],
    ['preview.customer.github.io', '.customer.github.io'],
    ['console.planisfy.localhost', '.planisfy.localhost'],
  ])('selects the registrable domain for %s', (hostname, expected) => {
    expect(sharedCookieDomain(hostname)).toBe(expected)
  })

  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])(
    'does not set a Domain attribute for %s',
    (hostname) => {
      expect(sharedCookieDomain(hostname)).toBeUndefined()
    }
  )

  it('ignores malformed encoded values without throwing', () => {
    expect(parseThemeCookie('planisfy-theme=dark; planisfy-theme=%E0%A4%A')).toBe('dark')
    expect(parseThemeCookie('planisfy-theme=%')).toBeUndefined()
  })

  it('uses the last valid duplicate theme cookie', () => {
    expect(parseThemeCookie('planisfy-theme=light; other=x; planisfy-theme=system')).toBe('system')
  })

  it('expires a host-only cookie before writing the shared domain cookie', () => {
    expect(buildThemeCookieWrites('dark', 'console.example.co.uk', true)).toEqual([
      'planisfy-theme=; Path=/; Max-Age=0; SameSite=Lax',
      'planisfy-theme=dark; Domain=.example.co.uk; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    ])
  })
})
