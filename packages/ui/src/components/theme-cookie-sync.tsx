'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

const THEME_COOKIE = 'planisfy-theme'
const VALID_THEMES = new Set(['light', 'dark', 'system'])
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function ThemeCookieSync() {
  const { setTheme, theme } = useTheme()
  const initialized = React.useRef(false)
  const currentTheme = React.useRef(theme)

  React.useEffect(() => {
    currentTheme.current = theme
  }, [theme])

  React.useEffect(() => {
    if (!theme) return

    const cookieTheme = readThemeCookie()
    if (!initialized.current) {
      initialized.current = true

      if (cookieTheme && cookieTheme !== theme) {
        setTheme(cookieTheme)
        return
      }
    }

    if (isTheme(theme)) {
      writeThemeCookie(theme)
    }
  }, [setTheme, theme])

  React.useEffect(() => {
    const syncFromCookie = () => {
      const cookieTheme = readThemeCookie()
      if (cookieTheme && cookieTheme !== currentTheme.current) {
        setTheme(cookieTheme)
      }
    }

    const interval = window.setInterval(syncFromCookie, 1500)
    window.addEventListener('focus', syncFromCookie)
    document.addEventListener('visibilitychange', syncFromCookie)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', syncFromCookie)
      document.removeEventListener('visibilitychange', syncFromCookie)
    }
  }, [setTheme])

  return null
}

function readThemeCookie() {
  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${THEME_COOKIE}=`))
    ?.split('=')[1]

  const theme = cookie ? decodeURIComponent(cookie) : undefined
  return isTheme(theme) ? theme : undefined
}

function writeThemeCookie(theme: string) {
  const encoded = encodeURIComponent(theme)
  const attributes = [
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    window.location.protocol === 'https:' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')

  document.cookie = `${THEME_COOKIE}=${encoded}; ${attributes}`

  const domain = sharedCookieDomain(window.location.hostname)
  if (domain) {
    document.cookie = `${THEME_COOKIE}=${encoded}; Domain=${domain}; ${attributes}`
  }
}

function sharedCookieDomain(hostname: string) {
  if (!hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return undefined

  const parts = hostname.split('.')
  return parts.slice(-2).join('.')
}

function isTheme(theme: unknown): theme is 'light' | 'dark' | 'system' {
  return typeof theme === 'string' && VALID_THEMES.has(theme)
}
