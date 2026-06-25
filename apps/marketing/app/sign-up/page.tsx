'use client'

import { SignUpForm } from '@planisfy/auth/ui'

import { clientEnv } from '@/env.client'

export default function SignUpPage() {
  return <SignUpForm defaultCallbackUrl={`${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/styles`} />
}
