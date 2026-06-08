"use client"

import * as React from "react"
import { authClient, signIn, signUp } from "./client"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { Input } from "@planisfy/ui/components/input"
import { Field, FieldDescription, FieldLabel } from "@planisfy/ui/components/field"
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
}: {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {children}
          {footer}
        </CardContent>
      </Card>
    </div>
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const target = callbackUrl(defaultCallbackUrl)
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
      title="Sign in to Planisfy"
      description="Use your account to open the console."
      footer={
        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <a href={resetHref} className="hover:text-foreground underline-offset-4 hover:underline">
            Forgot password?
          </a>
          <p>
            Don&apos;t have an account?{" "}
            <a href={signUpHref} className="text-foreground underline-offset-4 hover:underline">
              Sign up
            </a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
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
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const target = callbackUrl(defaultCallbackUrl)
    await signUp.email({
      email,
      password,
      name,
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
      title="Create your Planisfy account"
      description="Start with styles, tilesets, and API access."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href={signInHref} className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </a>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <FieldDescription>Use at least 8 characters.</FieldDescription>
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
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
        <form onSubmit={handleReset} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      </AuthShell>
    )
  }

  if (submitted) {
    return (
      <AuthShell title="Check your inbox" description="If an account exists for that email, a reset link is on the way.">
        <Button asChild variant="outline" className="w-full">
          <a href={signInHref}>Back to sign in</a>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Reset your password" description="Enter your email and we will send a reset link.">
      <form onSubmit={handleRequest} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="reset-email">Email</FieldLabel>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  )
}
