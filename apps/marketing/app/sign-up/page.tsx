"use client"

import { SignUpForm } from "@planisfy/auth/ui"

const consoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL

if (!consoleUrl) throw new Error("NEXT_PUBLIC_CONSOLE_URL is required.")

export default function SignUpPage() {
  return <SignUpForm defaultCallbackUrl={`${consoleUrl}/styles`} />
}
