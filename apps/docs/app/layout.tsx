import { RootProvider } from 'fumadocs-ui/provider/next'
import {
  SHARED_THEME_STORAGE_KEY,
  ThemeCookieSync,
} from '@planisfy/ui/components/theme-cookie-sync'
import type { Metadata } from 'next'
import './global.css'

const appUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3002'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
}

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          theme={{
            storageKey: SHARED_THEME_STORAGE_KEY,
          }}
        >
          <ThemeCookieSync />
          {children}
        </RootProvider>
      </body>
    </html>
  )
}
