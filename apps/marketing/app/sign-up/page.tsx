'use client'

import { SignUpForm } from '@planisfy/auth/ui'

import { env } from '@/env'

export default function SignUpPage() {
  return <SignUpForm defaultCallbackUrl={`${env.NEXT_PUBLIC_CONSOLE_URL}/styles`} />
}
