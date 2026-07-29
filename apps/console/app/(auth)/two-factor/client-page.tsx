'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, consumeTwoFactorCallback } from '@planisfy/auth/client'
import { sanitizeCallbackUrl } from '@planisfy/auth/ui'
import { Button } from '@planisfy/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@planisfy/ui/components/card'
import { Checkbox } from '@planisfy/ui/components/checkbox'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@planisfy/ui/components/tabs'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<TwoFactorFallback />}>
      <TwoFactorChallenge />
    </Suspense>
  )
}

function TwoFactorChallenge() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [method, setMethod] = useState('totp')
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const callbackUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/auth/complete'
    const stored = consumeTwoFactorCallback()
    const requested = searchParams.get('callbackUrl') ?? stored
    return sanitizeCallbackUrl(requested, '/auth/complete', window.location.origin)
  }, [searchParams])

  const verify = async () => {
    setBusy(true)
    setError('')
    try {
      const normalizedCode = code.replace(/\s+/gu, '')
      const result =
        method === 'backup'
          ? await authClient.twoFactor.verifyBackupCode({
              code: normalizedCode,
              trustDevice,
            })
          : await authClient.twoFactor.verifyTotp({
              code: normalizedCode,
              trustDevice,
            })
      if (result.error) {
        throw new Error(
          result.error.message ??
            (method === 'backup' ? 'The backup code is invalid' : 'The authenticator code is invalid')
        )
      }
      router.replace(callbackUrl)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to verify two-factor authentication')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Verify it&apos;s you</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter a current authenticator code or one unused backup code.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={method} onValueChange={setMethod}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="totp">Authenticator</TabsTrigger>
              <TabsTrigger value="backup">Backup code</TabsTrigger>
            </TabsList>
            <TabsContent value="totp" className="mt-5 space-y-2">
              <Label htmlFor="totp-code">Six-digit code</Label>
              <Input
                id="totp-code"
                value={method === 'totp' ? code : ''}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="000000"
                autoFocus
              />
            </TabsContent>
            <TabsContent value="backup" className="mt-5 space-y-2">
              <Label htmlFor="backup-code">One-use backup code</Label>
              <Input
                id="backup-code"
                value={method === 'backup' ? code : ''}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                placeholder="Enter a saved backup code"
              />
            </TabsContent>
          </Tabs>

          <div className="mt-5 flex items-start gap-2">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={(checked) => setTrustDevice(checked === true)}
            />
            <Label htmlFor="trust-device" className="font-normal leading-5">
              Trust this device for 30 days
            </Label>
          </div>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <Button
            className="mt-6 w-full"
            onClick={() => void verify()}
            disabled={busy || code.trim().length === 0}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? 'Verifying...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

function TwoFactorFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </main>
  )
}
