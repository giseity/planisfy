'use client'

import * as React from 'react'
import { authClient, isSocialProviderEnabled, signIn, signUp, type SocialProvider } from './client'
import { ArrowLeft, Github, Lock, Mail, Send } from 'lucide-react'
import { Button } from '@planisfy/ui/components/button'
import { PlanisfyLogo } from '@planisfy/ui/components/brand-mark'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import { cn } from '@planisfy/ui/lib/utils'
import { toast } from 'sonner'

export function sanitizeCallbackUrl(
  rawCallbackUrl: string | null | undefined,
  fallback: string,
  origin?: string
) {
  if (!rawCallbackUrl) return fallback
  if (rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')) {
    return rawCallbackUrl
  }
  const fallbackOrigin = originFromUrl(fallback)
  try {
    const parsed = new URL(rawCallbackUrl)
    if (origin && parsed.origin === origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    if (fallbackOrigin && parsed.origin === fallbackOrigin) {
      return parsed.toString()
    }
    return fallback
  } catch {
    return fallback
  }
}

function originFromUrl(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function callbackUrl(fallback: string) {
  if (typeof window === 'undefined') return fallback
  return sanitizeCallbackUrl(
    new URLSearchParams(window.location.search).get('callbackUrl'),
    fallback,
    window.location.origin
  )
}

function verificationUrl(callbackURL: string) {
  const params = new URLSearchParams({ callbackUrl: callbackURL })
  return `/verify-email?${params.toString()}`
}

function isEmailNotVerifiedError(error: { code?: string; message?: string; statusText?: string }) {
  const value = [error.code, error.message, error.statusText].filter(Boolean).join(' ')
  return /email[_ -]?not[_ -]?verified/i.test(value)
}

function authRedirectFromData(data: unknown) {
  if (!data || typeof data !== 'object' || !('url' in data)) return null
  const url = (data as { url?: unknown }).url
  if (typeof url !== 'string' || !url) return null
  if (typeof window === 'undefined') return url
  return sanitizeCallbackUrl(url, window.location.origin, window.location.origin)
}

function hasSessionToken(data: unknown) {
  if (!data || typeof data !== 'object' || !('token' in data)) return false
  const token = (data as { token?: unknown }).token
  return typeof token === 'string' && token.length > 0
}

function tokenFromUrl() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('token')
}

function AuthShell({
  title,
  description,
  children,
  footer,
  width = 'sm',
  icon,
  variant = 'centered',
}: {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: 'sm' | 'md'
  icon?: React.ReactNode
  variant?: 'centered' | 'split'
}) {
  const content = (
    <main
      className={cn(
        'flex w-full flex-col gap-6',
        width === 'md' ? 'max-w-[480px]' : 'max-w-[400px]',
        variant === 'split' && (width === 'md' ? 'max-w-[480px]' : 'max-w-md')
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        {variant === 'centered' && (
          <div className="flex size-[52px] items-center justify-center rounded-lg bg-primary text-[22px] font-bold text-primary-foreground">
            {icon ?? 'P'}
          </div>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-balance text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {footer}
    </main>
  )

  if (variant === 'split') {
    return <AuthSplitLayout>{content}</AuthSplitLayout>
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      {content}
    </div>
  )
}

export function AuthSplitLayout({
  children,
  sublabel = 'Customer console',
}: {
  children: React.ReactNode
  sublabel?: string
}) {
  return (
    <div className="grid min-h-svh bg-background text-foreground md:grid-cols-2 mx-auto">
      <AuthVisualPanel />
      <div className="flex flex-col gap-4 p-6 md:col-start-2 md:row-start-1 md:p-10">
        <div className="flex justify-center md:justify-start">
          <a
            href="/"
            className="rounded-md font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <PlanisfyLogo size="lg" markClassName="size-11" sublabel={sublabel} />
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">{children}</div>
      </div>
    </div>
  )
}

function AuthVisualPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-muted md:col-start-1 md:row-start-1 md:block">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--muted)_0%,var(--card)_46%,var(--accent)_100%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute left-[12%] top-[14%] h-[72%] w-[76%] rounded-lg border bg-background/75 p-4 shadow-2xl backdrop-blur">
        <div className="flex h-full flex-col overflow-hidden rounded-md border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="size-2 rounded-full bg-destructive" />
            <span className="size-2 rounded-full bg-chart-4" />
            <span className="size-2 rounded-full bg-success" />
            <span className="ml-2 h-2 w-28 rounded-full bg-muted" />
          </div>
          <div className="relative flex-1 overflow-hidden bg-background">
            <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:36px_36px]" />
            <div className="absolute left-[14%] top-[24%] h-20 w-48 rounded-md border bg-card/90 p-3 shadow-sm">
              <div className="mb-2 h-2 w-20 rounded-full bg-muted-foreground/30" />
              <div className="h-2 w-36 rounded-full bg-primary/50" />
              <div className="mt-2 h-2 w-28 rounded-full bg-secondary/50" />
            </div>
            <div className="absolute bottom-[18%] right-[12%] h-28 w-56 rounded-md border bg-card/90 p-3 shadow-sm">
              <div className="mb-3 h-2 w-24 rounded-full bg-muted-foreground/30" />
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span
                    key={index}
                    className={cn('h-6 rounded-sm', index % 3 === 0 ? 'bg-primary/60' : 'bg-muted')}
                  />
                ))}
              </div>
            </div>
            <div className="absolute bottom-[34%] left-[24%] h-24 w-64 rotate-[-10deg] rounded-full border-2 border-primary/50" />
            <div className="absolute bottom-[30%] left-[30%] h-16 w-44 rotate-[-10deg] rounded-full border-2 border-secondary/50" />
            <div className="absolute right-[24%] top-[22%] size-3 rounded-full bg-primary ring-8 ring-primary/15" />
            <div className="absolute left-[38%] top-[58%] size-3 rounded-full bg-secondary ring-8 ring-secondary/15" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthInput({
  icon,
  iconSize = 'default',
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  icon?: React.ReactNode
  iconSize?: 'default' | 'large'
}) {
  const hasLargeIcon = iconSize === 'large'

  return (
    <div className="relative">
      {icon && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 flex -translate-y-1/2 text-muted-foreground',
            hasLargeIcon ? 'left-3 [&_svg]:size-[18px]' : 'left-3.5 [&_svg]:size-4'
          )}
        >
          {icon}
        </span>
      )}
      <Input
        size="marketing"
        className={cn(icon && (hasLargeIcon ? 'pl-11' : 'pl-10'), className)}
        {...props}
      />
    </div>
  )
}

function AuthDivider() {
  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
      <span className="relative z-10 bg-background px-2 text-muted-foreground">
        Or continue with
      </span>
    </div>
  )
}

function SocialButton({
  provider,
  callbackURL,
  children,
  compact = false,
}: {
  provider: SocialProvider
  callbackURL: string
  children: React.ReactNode
  compact?: boolean
}) {
  const [loading, setLoading] = React.useState(false)

  async function handleSocialSignIn() {
    setLoading(true)
    try {
      const { data, error } = await signIn.social({ provider, callbackURL })
      if (error) {
        toast.error(error.message || `${provider} sign-in is unavailable`)
        return
      }
      if (data?.url) window.location.href = data.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${provider} sign-in is unavailable`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="marketing"
      className={cn(compact && 'flex-1')}
      disabled={loading}
      onClick={handleSocialSignIn}
    >
      {provider === 'github' ? (
        <Github className="size-4" />
      ) : (
        <img src="/auth/google-g.svg" alt="" aria-hidden="true" className="size-[18px]" />
      )}
      {loading ? 'Connecting...' : children}
    </Button>
  )
}

function SocialAuthOptions({
  callbackURL,
  compact = false,
}: {
  callbackURL: string
  compact?: boolean
}) {
  const providers = (['github', 'google'] as const).filter(isSocialProviderEnabled)

  if (providers.length === 0) {
    return null
  }

  return (
    <>
      <AuthDivider />
      <div className={compact ? 'flex gap-2' : 'flex flex-col gap-2'}>
        {providers.includes('github') && (
          <SocialButton provider="github" callbackURL={callbackURL} compact={compact}>
            {compact ? 'GitHub' : 'Continue with GitHub'}
          </SocialButton>
        )}
        {providers.includes('google') && (
          <SocialButton provider="google" callbackURL={callbackURL} compact={compact}>
            {compact ? 'Google' : 'Continue with Google'}
          </SocialButton>
        )}
      </div>
    </>
  )
}

export function SignInForm({
  defaultCallbackUrl = '/',
  signUpHref = '/sign-up',
  resetHref = '/reset-password',
}: {
  defaultCallbackUrl?: string
  signUpHref?: string
  resetHref?: string
}) {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const target = callbackUrl(defaultCallbackUrl)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    await signIn.email({
      email,
      password,
      callbackURL: target,
      fetchOptions: {
        onSuccess: (ctx: { data?: unknown }) => {
          window.location.assign(authRedirectFromData(ctx.data) ?? target)
        },
        onError: (ctx: { error: { code?: string; message: string; statusText?: string } }) => {
          if (isEmailNotVerifiedError(ctx.error)) {
            toast.info('Check your inbox to verify your email address.')
            window.location.assign(verificationUrl(target))
            return
          }
          toast.error(ctx.error.message)
        },
      },
    })
    setLoading(false)
  }

  return (
    <AuthShell
      title="Login to your account"
      description="Enter your email below to login to your account"
      variant="split"
      footer={
        <p className="text-center text-sm">
          Don&apos;t have an account?{' '}
          <a href={signUpHref} className="underline underline-offset-4">
            Sign up
          </a>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <AuthInput
            id="email"
            type="email"
            icon={<Mail />}
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a href={resetHref} className="text-sm underline-offset-4 hover:underline">
              Forgot your password?
            </a>
          </div>
          <AuthInput
            id="password"
            type="password"
            icon={<Lock />}
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" size="marketing" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Login'}
        </Button>
        <SocialAuthOptions callbackURL={target} />
      </form>
    </AuthShell>
  )
}

export function SignUpForm({
  defaultCallbackUrl = '/styles',
  signInHref = '/sign-in',
}: {
  defaultCallbackUrl?: string
  signInHref?: string
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const target = callbackUrl(defaultCallbackUrl)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    await signUp.email({
      email,
      password,
      name: name.trim(),
      callbackURL: target,
      fetchOptions: {
        onSuccess: (ctx: { data?: unknown }) => {
          if (hasSessionToken(ctx.data)) {
            window.location.assign(authRedirectFromData(ctx.data) ?? target)
            return
          }

          toast.info('Check your inbox to verify your email address.')
          window.location.assign(verificationUrl(target))
        },
        onError: (ctx: { error: { message: string } }) => {
          toast.error(ctx.error.message)
        },
      },
    })
    setLoading(false)
  }

  return (
    <AuthShell
      title="Create an account"
      description="Enter your information below to create your account"
      variant="split"
      width="md"
      footer={
        <>
          <p className="text-balance text-center text-xs leading-relaxed text-muted-foreground">
            By signing up you agree to our{' '}
            <a href="/terms" className="underline underline-offset-4 hover:text-primary">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </a>
          </p>
          <p className="text-center text-sm">
            Already have an account?{' '}
            <a href={signInHref} className="underline underline-offset-4">
              Sign in
            </a>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <AuthInput
            id="name"
            placeholder="Alex Chen"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <AuthInput
            id="email"
            type="email"
            icon={<Mail />}
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <AuthInput
            id="password"
            type="password"
            icon={<Lock />}
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className={cn('h-[3px] flex-1 rounded-sm', index <= 3 ? 'bg-chart-4' : 'bg-muted')}
              />
            ))}
          </div>
          <span className="mt-0.5 block text-[10px] text-chart-4">
            Good - add a special character for strong
          </span>
        </div>
        <Button type="submit" size="marketing" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
        <SocialAuthOptions callbackURL={target} compact />
      </form>
    </AuthShell>
  )
}

export function ResetPasswordForm({ signInHref = '/sign-in' }: { signInHref?: string }) {
  const [email, setEmail] = React.useState('')
  const [submitted, setSubmitted] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [token, setToken] = React.useState<string | null>(null)

  React.useEffect(() => {
    setToken(tokenFromUrl())
  }, [])

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setSubmitted(true)
    } catch {
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!token) return
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      await authClient.resetPassword({ token, newPassword: password })
      window.location.assign(signInHref)
    } catch {
      setError('Invalid or expired reset link. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  if (token) {
    return (
      <AuthShell
        title="Set a new password"
        description="Choose a password for your account."
        variant="split"
      >
        <form onSubmit={handleReset} className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <AuthInput
              id="new-password"
              type="password"
              icon={<Lock />}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <AuthInput
              id="confirm-password"
              type="password"
              icon={<Lock />}
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="marketing" className="w-full" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </Button>
        </form>
      </AuthShell>
    )
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your inbox"
        description="If an account exists for that email, a reset link is on the way."
        variant="split"
      >
        <Button asChild variant="outline" size="marketing" className="w-full">
          <a href={signInHref}>Back to sign in</a>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a reset link"
      variant="split"
    >
      <form onSubmit={handleRequest} className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="reset-email">Email address</Label>
          <AuthInput
            id="reset-email"
            type="email"
            icon={<Mail />}
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" size="marketing" className="w-full" disabled={loading}>
          <Send className="size-4" />
          {loading ? 'Sending...' : 'Send Reset Link'}
        </Button>
      </form>
      <div className="flex justify-center">
        <a
          href={signInHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </a>
      </div>
    </AuthShell>
  )
}
