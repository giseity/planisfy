import { betterFetch } from '@better-fetch/fetch'
import type { Session } from 'better-auth/types'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from './env'

export function getConsoleAppOrigin(requestOrigin: string) {
  return env.NEXT_PUBLIC_APP_URL || requestOrigin
}

export function getConsoleAuthOrigin(requestOrigin: string) {
  return env.NEXT_PUBLIC_AUTH_ORIGIN || getConsoleAppOrigin(requestOrigin)
}

export function getConsoleAuthFetchOrigin(requestOrigin: string) {
  return env.AUTH_INTERNAL_ORIGIN || getConsoleAuthOrigin(requestOrigin)
}

export function getSessionBaseURL(requestOrigin: string) {
  return getConsoleAuthFetchOrigin(requestOrigin)
}

export function buildSignInRedirectURL(requestUrl: string, requestOrigin: string) {
  const signInUrl = new URL('/sign-in', getConsoleAppOrigin(requestOrigin))
  const requested = new URL(requestUrl)
  const callbackUrl = new URL(
    `${requested.pathname}${requested.search}${requested.hash}`,
    getConsoleAppOrigin(requestOrigin)
  )
  signInUrl.searchParams.set('callbackUrl', callbackUrl.toString())
  return signInUrl
}

export async function proxy(request: NextRequest) {
  let session: Session | null = null

  try {
    const response = await betterFetch<Session>('/api/auth/get-session', {
      baseURL: getSessionBaseURL(request.nextUrl.origin),
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    })
    session = response.data ?? null
  } catch {
    session = null
  }

  if (!session) {
    return NextResponse.redirect(
      buildSignInRedirectURL(request.nextUrl.href, request.nextUrl.origin)
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/onboarding/:path*',
    '/styles/:path*',
    '/tilesets/:path*',
    '/keys/:path*',
    '/usage/:path*',
    '/operations/:path*',
    '/platform/:path*',
    '/organization/:path*',
    '/team/:path*',
    '/settings/:path*',
    '/billing/:path*',
    '/integration/:path*',
  ],
}
