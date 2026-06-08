"use client"

import { SignUpForm } from "@planisfy/auth/ui"

export default function SignUpPage() {
  return <SignUpForm defaultCallbackUrl={`${process.env.NEXT_PUBLIC_CONSOLE_URL ?? ""}/styles`} />
}
