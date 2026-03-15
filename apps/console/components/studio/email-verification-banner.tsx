"use client"

import { useState } from "react"
import { useSession, authClient } from "@planisfy/auth/client"
import { Button } from "@planisfy/ui/components/button"
import { Mail, X } from "lucide-react"

export function EmailVerificationBanner() {
  const { data: session } = useSession()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (dismissed || !session?.user) return null
  if (session.user.emailVerified) return null

  const handleResend = async () => {
    setSending(true)
    try {
      await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: "/studio/styles",
      })
      setSent(true)
    } catch {
      alert("Failed to send verification email")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
      <div className="container max-w-6xl flex items-center gap-3 text-sm">
        <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-amber-800 dark:text-amber-200 flex-1">
          Please verify your email address.
          {sent ? (
            <span className="ml-1 font-medium">Check your inbox!</span>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="text-amber-800 dark:text-amber-200 underline px-1 h-auto"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? "Sending..." : "Resend verification email"}
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
