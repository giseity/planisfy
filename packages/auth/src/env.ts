import { getRuntimeSecret } from '@planisfy/env'

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function authUrlFromAppUrl(value: string | undefined) {
  return value ? `${trimTrailingSlash(value)}/api/auth` : undefined
}

export function getAuthSecret() {
  return getRuntimeSecret('BETTER_AUTH_SECRET')
}

export function getAuthBaseURL() {
  const authOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN
  if (!authOrigin) {
    throw new Error('NEXT_PUBLIC_AUTH_ORIGIN is required.')
  }
  return authUrlFromAppUrl(authOrigin)!
}

export function getOAuthProxyURL() {
  const value = process.env.OAUTH_PROXY_ORIGIN
  return value ? trimTrailingSlash(value) : undefined
}

export function getAuthTrustedOrigins() {
  return buildTrustedOrigins(
    getAuthBaseURL(),
    getOAuthProxyURL(),
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_CONSOLE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_DOCS_URL,
    process.env.NEXT_PUBLIC_MARKETING_URL
  )
}

export function buildTrustedOrigins(...urls: Array<string | undefined>) {
  return Array.from(
    new Set(urls.filter((url): url is string => Boolean(url)).map((url) => new URL(url).origin))
  )
}

export function getSocialProviderCredentials() {
  return {
    github: optionalProviderCredentials(
      process.env.GITHUB_CLIENT_ID,
      process.env.GITHUB_CLIENT_SECRET
    ),
    google: optionalProviderCredentials(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    ),
  }
}

function optionalProviderCredentials(
  clientId: string | undefined,
  clientSecret: string | undefined
) {
  if (
    !clientId ||
    !clientSecret ||
    !isUsableOAuthValue(clientId) ||
    !isUsableOAuthValue(clientSecret)
  ) {
    return null
  }
  return { clientId, clientSecret }
}

function isUsableOAuthValue(value: string | undefined) {
  return Boolean(
    value && !/replace-me|placeholder|example|changeme|change-this|local-dev-only/i.test(value)
  )
}
