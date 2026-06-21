'use client'

import { SignInForm } from '@planisfy/auth/ui'

import { env } from '@/env'

export default function SignInPage() {
  return <SignInForm defaultCallbackUrl={env.NEXT_PUBLIC_CONSOLE_URL} />
}
