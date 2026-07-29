'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import QRCode from 'qrcode'
import { authClient, useSession } from '@planisfy/auth/client'
import { Badge } from '@planisfy/ui/components/badge'
import { Button } from '@planisfy/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@planisfy/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@planisfy/ui/components/dialog'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import {
  Check,
  Clipboard,
  Download,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

interface ConnectedAccount {
  providerId: string
}

interface Enrollment {
  backupCodes: string[]
  qrCodeDataUrl: string
  secret: string
}

type DialogMode = 'enable' | 'disable' | 'regenerate' | null

export function TwoFactorSection() {
  const { data: session, refetch } = useSession()
  const [hasCredential, setHasCredential] = useState(false)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [mode, setMode] = useState<DialogMode>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const enabled = Boolean(session?.user?.twoFactorEnabled)

  useEffect(() => {
    let active = true

    void authClient
      .listAccounts()
      .then((result) => {
        if (!active) return
        if (result.error) {
          throw new Error(result.error.message ?? 'Unable to inspect sign-in methods')
        }
        const accounts = (result.data ?? []) as ConnectedAccount[]
        setHasCredential(accounts.some((account) => account.providerId === 'credential'))
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Unable to inspect sign-in methods')
        }
      })
      .finally(() => {
        if (active) setAccountsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const resetDialog = useCallback(() => {
    setMode(null)
    setPassword('')
    setCode('')
    setEnrollment(null)
    setBackupCodes([])
    setCopied(false)
    setError('')
  }, [])

  const beginEnable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.twoFactor.enable({
        ...(hasCredential ? { password } : {}),
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Unable to start two-factor enrollment')
      }
      const totpURI = String(result.data?.totpURI ?? '')
      const generatedBackupCodes = Array.isArray(result.data?.backupCodes)
        ? result.data.backupCodes.map(String)
        : []
      if (!totpURI || generatedBackupCodes.length === 0) {
        throw new Error('The server returned incomplete two-factor enrollment details')
      }
      const qrCodeDataUrl = await QRCode.toDataURL(totpURI, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 240,
      })
      setEnrollment({
        backupCodes: generatedBackupCodes,
        qrCodeDataUrl,
        secret: secretFromTotpURI(totpURI),
      })
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to enable two-factor authentication')
    } finally {
      setBusy(false)
    }
  }, [hasCredential, password])

  const openEnable = () => {
    setMode('enable')
    setError('')
    if (!hasCredential) {
      void beginEnable()
    }
  }

  const verifyEnrollment = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: compactCode(code) })
      if (result.error) {
        throw new Error(result.error.message ?? 'The verification code is invalid')
      }
      setBackupCodes(enrollment?.backupCodes ?? [])
      setEnrollment(null)
      setCode('')
      await refetch?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to verify the authenticator code')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.twoFactor.disable({
        ...(hasCredential ? { password } : {}),
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Unable to disable two-factor authentication')
      }
      await refetch?.()
      resetDialog()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disable two-factor authentication')
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await authClient.twoFactor.generateBackupCodes({
        ...(hasCredential ? { password } : {}),
      })
      if (result.error) {
        throw new Error(result.error.message ?? 'Unable to generate new backup codes')
      }
      const generated = Array.isArray(result.data?.backupCodes)
        ? result.data.backupCodes.map(String)
        : []
      if (generated.length === 0) {
        throw new Error('The server did not return replacement backup codes')
      }
      setBackupCodes(generated)
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate backup codes')
    } finally {
      setBusy(false)
    }
  }

  const copyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopied(true)
  }

  const downloadBackupCodes = () => {
    const blob = new Blob(
      [
        'Planisfy two-factor backup codes\n',
        'Each code can be used once. Store these codes securely.\n\n',
        backupCodes.join('\n'),
        '\n',
      ],
      { type: 'text/plain;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'planisfy-backup-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const needsPassword = hasCredential && !enrollment && backupCodes.length === 0

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Two-factor authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Authenticator app</p>
              <Badge variant={enabled ? 'success' : 'outline'}>
                {enabled ? 'Enabled' : 'Not enabled'}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Require a time-based code when signing in. One-use backup codes provide recovery if
              your authenticator is unavailable.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <Button
                    variant="outline"
                    disabled={accountsLoading}
                    onClick={() => {
                      setMode('regenerate')
                      setError('')
                    }}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Replace backup codes
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={accountsLoading}
                    onClick={() => {
                      setMode('disable')
                      setError('')
                    }}
                  >
                    Disable 2FA
                  </Button>
                </>
              ) : (
                <Button disabled={accountsLoading} onClick={openEnable}>
                  <ShieldCheck className="h-4 w-4" />
                  Enable 2FA
                </Button>
              )}
            </div>
            {!mode && error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle(mode, enrollment, backupCodes)}</DialogTitle>
            <DialogDescription>
              {dialogDescription(mode, enrollment, backupCodes)}
            </DialogDescription>
          </DialogHeader>

          {needsPassword && (
            <div className="space-y-2">
              <Label htmlFor="two-factor-password">Current password</Label>
              <Input
                id="two-factor-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}

          {mode === 'enable' && enrollment && (
            <div className="space-y-5">
              <div className="flex justify-center rounded-lg border bg-white p-3">
                <Image
                  src={enrollment.qrCodeDataUrl}
                  alt="Authenticator enrollment QR code"
                  width={240}
                  height={240}
                  unoptimized
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="two-factor-secret">Manual setup key</Label>
                <Input
                  id="two-factor-secret"
                  value={enrollment.secret}
                  readOnly
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="two-factor-code">Six-digit authenticator code</Label>
                <Input
                  id="two-factor-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder="000000"
                />
              </div>
            </div>
          )}

          {backupCodes.length > 0 && (
            <BackupCodeList
              codes={backupCodes}
              copied={copied}
              onCopy={() => void copyBackupCodes()}
              onDownload={downloadBackupCodes}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            {backupCodes.length > 0 ? (
              <Button onClick={resetDialog}>I have saved these codes</Button>
            ) : mode === 'enable' && enrollment ? (
              <Button
                onClick={() => void verifyEnrollment()}
                disabled={busy || compactCode(code).length !== 6}
              >
                {busy ? 'Verifying...' : 'Verify and enable'}
              </Button>
            ) : mode === 'enable' ? (
              <Button
                onClick={() => void beginEnable()}
                disabled={busy || (hasCredential && !password)}
              >
                {busy ? 'Starting...' : 'Continue'}
              </Button>
            ) : mode === 'disable' ? (
              <Button
                variant="destructive"
                onClick={() => void disable()}
                disabled={busy || (hasCredential && !password)}
              >
                {busy ? 'Disabling...' : 'Disable 2FA'}
              </Button>
            ) : (
              <Button
                onClick={() => void regenerate()}
                disabled={busy || (hasCredential && !password)}
              >
                {busy ? 'Generating...' : 'Replace codes'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function BackupCodeList({
  codes,
  copied,
  onCopy,
  onDownload,
}: {
  codes: string[]
  copied: boolean
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        These codes are displayed once. Each code can recover one sign-in and is invalidated after
        use.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDownload}>
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  )
}

function secretFromTotpURI(totpURI: string) {
  try {
    return new URL(totpURI).searchParams.get('secret') ?? totpURI
  } catch {
    return totpURI
  }
}

function compactCode(value: string) {
  return value.replace(/\s+/gu, '')
}

function dialogTitle(mode: DialogMode, enrollment: Enrollment | null, backupCodes: string[]) {
  if (backupCodes.length > 0) return 'Save your backup codes'
  if (mode === 'disable') return 'Disable two-factor authentication'
  if (mode === 'regenerate') return 'Replace backup codes'
  if (enrollment) return 'Connect your authenticator'
  return 'Enable two-factor authentication'
}

function dialogDescription(
  mode: DialogMode,
  enrollment: Enrollment | null,
  backupCodes: string[]
) {
  if (backupCodes.length > 0) {
    return mode === 'enable'
      ? 'These codes are displayed once. Keep them somewhere secure before closing this window.'
      : 'The previous backup codes no longer work. Keep this replacement set somewhere secure.'
  }
  if (mode === 'disable') {
    return 'Your account will no longer require an authenticator or backup code at sign-in.'
  }
  if (mode === 'regenerate') {
    return 'Generating a new set immediately invalidates every existing backup code.'
  }
  if (enrollment) {
    return 'Scan the QR code, or enter the manual key, then verify one current code.'
  }
  return 'Confirm this account before creating a new authenticator secret.'
}
