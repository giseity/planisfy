"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { authClient } from "@planisfy/auth/client"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  if (token) {
    return <NewPasswordForm token={token} />
  }

  return <RequestResetForm />
}

function RequestResetForm() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      })
      setSubmitted(true)
    } catch {
      // Always show success to prevent email enumeration
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <h1 className="text-2xl font-bold">Check your inbox</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          If an account exists with that email, we&apos;ve sent a password reset
          link. It expires in 1 hour.
        </p>
        <Link
          href="/sign-in"
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="text-muted-foreground text-center max-w-sm">
        Enter your email address and we&apos;ll send you a link to reset your
        password.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <Link
        href="/sign-in"
        className="text-sm text-muted-foreground hover:text-foreground underline"
      >
        Back to sign in
      </Link>
    </div>
  )
}

function NewPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

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
      await authClient.resetPassword({
        newPassword: password,
        token,
      })
      router.push("/sign-in")
    } catch {
      setError("Invalid or expired reset link. Please request a new one.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-bold">Set new password</h1>
      <p className="text-muted-foreground text-center max-w-sm">
        Enter your new password below.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          minLength={8}
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Resetting..." : "Reset password"}
        </Button>
      </form>
      <Link
        href="/reset-password"
        className="text-sm text-muted-foreground hover:text-foreground underline"
      >
        Request a new link
      </Link>
    </div>
  )
}
