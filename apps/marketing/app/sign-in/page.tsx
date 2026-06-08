"use client"

import { SignInForm } from "@planisfy/auth/ui"

export default function SignInPage() {
  return <SignInForm defaultCallbackUrl={process.env.NEXT_PUBLIC_CONSOLE_URL ?? "/"} />
}
