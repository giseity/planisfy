'use client'

import { useEffect, useState } from 'react'
import { useSession, authClient } from '@planisfy/auth/client'
import { Button } from '@planisfy/ui/components/button'
import { Mail, X } from 'lucide-react'
import { toast } from 'sonner'

export function EmailVerificationBanner() {
  const { data: session, refetch } = useSession()
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !session?.user || session.user.emailVerified) return

    const timeout = window.setTimeout(() => {
      void refetch?.()
    }, 1500)

    return () => window.clearTimeout(timeout)
  }, [mounted, refetch, session?.user?.email, session?.user?.emailVerified])

  if (!mounted) return null
  if (dismissed || !session?.user) return null
  if (session.user.emailVerified) return null

  const handleResend = async () => {
    setSending(true)
    try {
      const result = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: '/styles',
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to send verification email')
      }
      await refetch?.()
      setRequested(true)
      toast.success('Verification email requested')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send verification email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 text-sm">
        <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-amber-800 dark:text-amber-200 flex-1">
          Please verify your email address.
          {requested ? (
            <span className="ml-1 font-medium">Check your inbox!</span>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="text-amber-800 dark:text-amber-200 underline px-1 h-auto"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Resend verification email'}
            </Button>
          )}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-amber-600 dark:text-amber-400 hover:text-amber-800"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
