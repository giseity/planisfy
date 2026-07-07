'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, useSession } from '@planisfy/auth/client'
import { sanitizeCallbackUrl } from '@planisfy/auth/ui'
import { Button } from '@planisfy/ui/components/button'
import { Card, CardContent } from '@planisfy/ui/components/card'
import { api } from '@/lib/api'
import { CheckCircle2, Loader2, MailCheck, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'

const POLL_MS = 2_500

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, refetch } = useSession()
  const [email, setEmail] = useState<string | null>(session?.user?.email ?? null)
  const [verified, setVerified] = useState(Boolean(session?.user?.emailVerified))
  const [checking, setChecking] = useState(true)
  const [sending, setSending] = useState(false)
  const [requested, setRequested] = useState(false)

  const callbackUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/styles'
    return sanitizeCallbackUrl(searchParams.get('callbackUrl'), '/styles', window.location.origin)
  }, [searchParams])

  const checkVerification = useCallback(async () => {
    try {
      const [profileResult] = await Promise.allSettled([api.getProfile(), refetch?.()])
      if (profileResult.status === 'fulfilled') {
        setEmail(profileResult.value.data.email)
        setVerified(profileResult.value.data.emailVerified)
        return profileResult.value.data.emailVerified
      }
      if (session?.user?.email) setEmail(session.user.email)
      if (session?.user?.emailVerified) {
        setVerified(true)
        return true
      }
    } finally {
      setChecking(false)
    }
    return false
  }, [refetch, session?.user?.email, session?.user?.emailVerified])

  useEffect(() => {
    if (session?.user?.email) setEmail(session.user.email)
    if (session?.user?.emailVerified) setVerified(true)
  }, [session?.user?.email, session?.user?.emailVerified])

  useEffect(() => {
    let active = true

    async function poll() {
      const isVerified = await checkVerification()
      if (active && isVerified) {
        router.replace(callbackUrl)
      }
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, POLL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [callbackUrl, checkVerification, router])

  async function handleResend() {
    if (!email) {
      toast.error('Sign in again to resend your verification email.')
      return
    }

    setSending(true)
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackUrl,
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to send verification email')
      }
      setRequested(true)
      toast.success('Verification email requested')
      await checkVerification()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send verification email')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Click the verification link in your inbox. This page will continue as soon as your
            account is verified.
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="flex items-center gap-3 p-4 text-left">
            {verified ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            ) : checking ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {verified ? 'Email verified' : 'Waiting for verification...'}
              </p>
              <p className="text-xs text-muted-foreground">
                {verified ? 'Redirecting to your workspace.' : 'You can verify in another tab.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex w-full flex-col gap-2">
          <Button variant="outline" onClick={handleResend} disabled={sending || !email}>
            <RefreshCcw className="h-4 w-4" />
            {sending ? 'Sending...' : requested ? 'Send again' : 'Resend verification email'}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/sign-up">Wrong email? Change it</Link>
          </Button>
        </div>

        <div className="w-full rounded-md bg-muted p-4 text-left">
          <p className="text-xs font-medium text-muted-foreground">Did not receive the email?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>Check your spam or junk folder.</li>
            <li>Make sure the email address is correct.</li>
            <li>Use resend if the first email did not arrive.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}

function VerifyEmailFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </main>
  )
}
