'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import {
  SHARED_THEME_STORAGE_KEY,
  ThemeCookieSync,
} from '@planisfy/ui/components/theme-cookie-sync'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      storageKey={SHARED_THEME_STORAGE_KEY}
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <ThemeCookieSync />
      {children}
    </NextThemesProvider>
  )
}
