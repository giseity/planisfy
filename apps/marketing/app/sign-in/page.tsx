'use client'

import { SignInForm } from '@planisfy/auth/ui'

import { clientEnv } from '@/env.client'

export default function SignInPage() {
  return <SignInForm defaultCallbackUrl={clientEnv.NEXT_PUBLIC_CONSOLE_URL} />
}
