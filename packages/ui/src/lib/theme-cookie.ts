import { getDomain } from 'tldts'

export const SHARED_THEME_STORAGE_KEY = 'planisfy-theme'

const VALID_THEMES = new Set(['light', 'dark', 'system'])
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type SharedTheme = 'light' | 'dark' | 'system'

export function isSharedTheme(theme: unknown): theme is SharedTheme {
  return typeof theme === 'string' && VALID_THEMES.has(theme)
}

export function parseThemeCookie(cookieHeader: string): SharedTheme | undefined {
  let selectedTheme: SharedTheme | undefined

  for (const part of cookieHeader.split(';')) {
    const cookie = part.trim()
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator) !== SHARED_THEME_STORAGE_KEY) continue

    try {
      const candidate = decodeURIComponent(cookie.slice(separator + 1))
      if (isSharedTheme(candidate)) selectedTheme = candidate
    } catch {
      // A malformed cookie must not prevent the application from rendering or replacing it.
    }
  }

  return selectedTheme
}

export function sharedCookieDomain(hostname: string): string | undefined {
  const domain = getDomain(hostname, { allowPrivateDomains: true })
  return domain ? `.${domain}` : undefined
}

export function buildThemeCookieWrites(
  theme: SharedTheme,
  hostname: string,
  secure: boolean
): string[] {
  const encoded = encodeURIComponent(theme)
  const attributes = [
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')

  const domain = sharedCookieDomain(hostname)
  if (!domain) {
    return [`${SHARED_THEME_STORAGE_KEY}=${encoded}; ${attributes}`]
  }

  return [
    `${SHARED_THEME_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`,
    `${SHARED_THEME_STORAGE_KEY}=${encoded}; Domain=${domain}; ${attributes}`,
  ]
}
