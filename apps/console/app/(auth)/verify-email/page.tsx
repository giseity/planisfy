import Link from "next/link"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent } from "@planisfy/ui/components/card"
import { MailCheck, RefreshCcw } from "lucide-react"

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We sent a verification link to your email address. Click the link to verify your account and get started.
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="flex items-center gap-3 p-4 text-left">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Waiting for verification...</p>
              <p className="text-xs text-muted-foreground">This page will update automatically.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex w-full flex-col gap-2">
          <Button variant="outline">
            <RefreshCcw className="h-4 w-4" />
            Resend verification email
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
            <li>Allow up to 5 minutes for delivery.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
