"use client"

import * as React from "react"
import { authClient, signIn, signUp } from "./client"
import { ArrowLeft, Building2, Chrome, Github, KeyRound, Lock, Mail, Send } from "lucide-react"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Field, FieldLabel } from "@planisfy/ui/components/field"
import { cn } from "@planisfy/ui/lib/utils"
import { toast } from "sonner"

function callbackUrl(fallback: string) {
  if (typeof window === "undefined") return fallback
  return new URLSearchParams(window.location.search).get("callbackUrl") ?? fallback
}

function tokenFromUrl() {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("token")
}

function AuthShell({
  title,
  description,
  children,
  footer,
  width = "sm",
  icon,
}: {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: "sm" | "md"
  icon?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <main
        className={cn(
          "flex w-full flex-col gap-6",
          width === "md" ? "max-w-[420px]" : "max-w-[400px]",
        )}
      >
        <div className="text-center">
          <div className="mx-auto mb-3.5 flex size-[52px] items-center justify-center rounded-lg bg-primary text-[22px] font-bold text-primary-foreground">
            {icon ?? "P"}
          </div>
          <h1 className="m-0 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
        {footer}
      </main>
    </div>
  )
}

function AuthInput({
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  icon?: React.ReactNode
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      )}
      <Input
        className={cn(
          "h-9 rounded-md bg-background text-sm",
          icon && "pl-9",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function AuthLabel(props: React.ComponentProps<typeof FieldLabel>) {
  return <FieldLabel className="text-xs font-medium" {...props} />
}

function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] uppercase tracking-wider">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function SocialButton({
  provider,
  callbackURL,
  children,
  compact = false,
}: {
  provider: "github" | "google"
  callbackURL: string
  children: React.ReactNode
  compact?: boolean
}) {
  const [loading, setLoading] = React.useState(false)
  const Icon = provider === "github" ? Github : Chrome

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
      toast.error(
        error instanceof Error
          ? error.message
          : `${provider} sign-in is unavailable`,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-10 justify-center bg-card text-[13px] font-medium",
        compact && "flex-1",
      )}
      disabled={loading}
      onClick={handleSocialSignIn}
    >
      <Icon className="size-4" />
      {loading ? "Connecting..." : children}
    </Button>
  )
}

export function SignInForm({
  defaultCallbackUrl = "/",
  signUpHref = "/sign-up",
  resetHref = "/reset-password",
}: {
  defaultCallbackUrl?: string
  signUpHref?: string
  resetHref?: string
}) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
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
        onSuccess: () => {
          window.location.assign(target)
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
      title="Welcome back"
      description="Sign in to your Planisfy account"
      footer={
        <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
          <a
            href={signUpHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
              Sign up
            </a>
          </p>
      }
    >
      <div className="flex flex-col gap-2">
        <SocialButton provider="github" callbackURL={target}>
          Continue with GitHub
        </SocialButton>
        <SocialButton provider="google" callbackURL={target}>
          Continue with Google
        </SocialButton>
      </div>
      <AuthDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Field>
          <AuthLabel htmlFor="email">Email</AuthLabel>
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
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <AuthLabel htmlFor="password">Password</AuthLabel>
            <a
              href={resetHref}
              className="text-[11px] text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
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
        </Field>
        <Button type="submit" className="h-10 w-full justify-center text-sm" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </AuthShell>
  )
}

export function SignUpForm({
  defaultCallbackUrl = "/styles",
  signInHref = "/sign-in",
}: {
  defaultCallbackUrl?: string
  signInHref?: string
}) {
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [organizationName, setOrganizationName] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const target = callbackUrl(defaultCallbackUrl)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    await signUp.email({
      email,
      password,
      name: `${firstName} ${lastName}`.trim(),
      callbackURL: target,
      fetchOptions: {
        onSuccess: () => {
          window.location.assign(target)
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
      title="Create your account"
      description="Start building with geospatial APIs in minutes"
      width="md"
      footer={
        <>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            By signing up you agree to our{" "}
            <a href="/terms" className="text-primary underline-offset-4 hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-primary underline-offset-4 hover:underline">
              Privacy Policy
            </a>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <a
              href={signInHref}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </p>
        </>
      }
    >
      <div className="flex gap-2">
        <SocialButton provider="github" callbackURL={target} compact>
          GitHub
        </SocialButton>
        <SocialButton provider="google" callbackURL={target} compact>
          Google
        </SocialButton>
      </div>
      <AuthDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <AuthLabel htmlFor="first-name">First name</AuthLabel>
            <AuthInput
              id="first-name"
              placeholder="Alex"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              autoComplete="given-name"
            />
          </Field>
          <Field>
            <AuthLabel htmlFor="last-name">Last name</AuthLabel>
            <AuthInput
              id="last-name"
              placeholder="Chen"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field>
          <AuthLabel htmlFor="email">Email</AuthLabel>
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
        </Field>
        <Field>
          <AuthLabel htmlFor="password">Password</AuthLabel>
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
                className={cn(
                  "h-[3px] flex-1 rounded-sm",
                  index <= 3 ? "bg-chart-4" : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className="mt-0.5 block text-[10px] text-chart-4">
            Good - add a special character for strong
          </span>
        </Field>
        <Field>
          <AuthLabel htmlFor="organization">Organization name</AuthLabel>
          <AuthInput
            id="organization"
            icon={<Building2 />}
            placeholder="Acme Corp (optional - create later)"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            autoComplete="organization"
          />
        </Field>
        <Button type="submit" className="h-10 w-full justify-center text-sm" disabled={loading}>
          {loading ? "Creating account..." : "Create Account"}
        </Button>
      </form>
    </AuthShell>
  )
}

export function ResetPasswordForm({ signInHref = "/sign-in" }: { signInHref?: string }) {
  const [email, setEmail] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [error, setError] = React.useState("")
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
    setError("")
    if (!token) return
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    setLoading(true)
    try {
      await authClient.resetPassword({ token, newPassword: password })
      window.location.assign(signInHref)
    } catch {
      setError("Invalid or expired reset link. Please request a new one.")
    } finally {
      setLoading(false)
    }
  }

  if (token) {
    return (
      <AuthShell title="Set a new password" description="Choose a password for your account.">
        <form onSubmit={handleReset} className="flex flex-col gap-3.5">
          <Field>
            <AuthLabel htmlFor="new-password">New password</AuthLabel>
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
          </Field>
          <Field>
            <AuthLabel htmlFor="confirm-password">Confirm password</AuthLabel>
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
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-10 w-full justify-center" disabled={loading}>
            {loading ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </AuthShell>
    )
  }

  if (submitted) {
    return (
      <AuthShell title="Check your inbox" description="If an account exists for that email, a reset link is on the way.">
        <Button asChild variant="outline" className="h-10 w-full justify-center">
          <a href={signInHref}>Back to sign in</a>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a reset link"
      icon={<KeyRound className="size-6 text-primary" />}
    >
      <form onSubmit={handleRequest} className="flex flex-col gap-3.5">
        <Field>
          <AuthLabel htmlFor="reset-email">Email address</AuthLabel>
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
        </Field>
        <Button type="submit" className="h-10 w-full justify-center" disabled={loading}>
          <Send className="size-4" />
          {loading ? "Sending..." : "Send Reset Link"}
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
