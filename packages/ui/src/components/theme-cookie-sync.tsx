'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import {
  buildThemeCookieWrites,
  isSharedTheme,
  parseThemeCookie,
} from '../lib/theme-cookie'

export { SHARED_THEME_STORAGE_KEY } from '../lib/theme-cookie'

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

    if (isSharedTheme(theme)) {
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
  return parseThemeCookie(document.cookie)
}

function writeThemeCookie(theme: 'light' | 'dark' | 'system') {
  const writes = buildThemeCookieWrites(
    theme,
    window.location.hostname,
    window.location.protocol === 'https:'
  )
  for (const cookie of writes) {
    document.cookie = cookie
  }
}
