'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Loader2 } from 'lucide-react'

const DEFAULT_VIEW_PATHS = {
  dashboard: '/',
  styles: '/styles',
  operations: '/operations',
} as const

export default function AuthCompletePage() {
  const router = useRouter()
  const [message, setMessage] = useState('Loading your workspace...')

  useEffect(() => {
    let active = true

    void api
      .getProfile()
      .then((response) => {
        if (!active) return
        router.replace(DEFAULT_VIEW_PATHS[response.data.preferences.defaultView])
      })
      .catch(() => {
        if (!active) return
        setMessage('Preferences could not be loaded. Opening the dashboard...')
        router.replace('/')
      })

    return () => {
      active = false
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {message}
      </div>
    </main>
  )
}
