import { createEnv, getRuntimeSecret, z } from '@planisfy/env'
import process from 'node:process'

const optionalUrlSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional()
)

const optionalStringSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional()
)

const authEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  NEXT_PUBLIC_API_URL: optionalUrlSchema,
  NEXT_PUBLIC_AUTH_ORIGIN: optionalUrlSchema,
  NEXT_PUBLIC_APP_URL: optionalUrlSchema,
  NEXT_PUBLIC_CONSOLE_URL: optionalUrlSchema,
  NEXT_PUBLIC_ADMIN_URL: optionalUrlSchema,
  NEXT_PUBLIC_DOCS_URL: optionalUrlSchema,
  NEXT_PUBLIC_MARKETING_URL: optionalUrlSchema,
  OAUTH_PROXY_ORIGIN: optionalUrlSchema,
  INTERNAL_API_SECRET: optionalStringSchema,
  ZEPTOMAIL_SEND_MAIL_TOKEN: optionalStringSchema,
  AUTH_COOKIE_DOMAIN: optionalStringSchema,
  GITHUB_CLIENT_ID: optionalStringSchema,
  GITHUB_CLIENT_SECRET: optionalStringSchema,
  GOOGLE_CLIENT_ID: optionalStringSchema,
  GOOGLE_CLIENT_SECRET: optionalStringSchema,
})

function getAuthEnv() {
  return createEnv(authEnvSchema, process.env, {
    appName: 'auth',
    onInvalid: 'throw',
  })
}

function requiredEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function authUrlFromAppUrl(value: string | undefined) {
  return value ? `${trimTrailingSlash(value)}/api/auth` : undefined
}

export function getAuthSecret() {
  return getRuntimeSecret('BETTER_AUTH_SECRET')
}

export function getApiURL() {
  return requiredEnv(getAuthEnv().NEXT_PUBLIC_API_URL, 'NEXT_PUBLIC_API_URL')
}

export function getAuthBaseURL() {
  const authOrigin = requiredEnv(getAuthEnv().NEXT_PUBLIC_AUTH_ORIGIN, 'NEXT_PUBLIC_AUTH_ORIGIN')
  return authUrlFromAppUrl(authOrigin)!
}

export function getOAuthProxyURL() {
  const value = getAuthEnv().OAUTH_PROXY_ORIGIN
  return value ? trimTrailingSlash(value) : undefined
}

export function getInternalApiSecret() {
  return getAuthEnv().INTERNAL_API_SECRET
}

export function isAuthEmailDeliveryConfigured() {
  return Boolean(getAuthEnv().ZEPTOMAIL_SEND_MAIL_TOKEN)
}

export function getAuthCookieDomainOverride() {
  return getAuthEnv().AUTH_COOKIE_DOMAIN
}

export function isProductionEnvironment() {
  return getAuthEnv().NODE_ENV === 'production'
}

export function getAuthTrustedOrigins() {
  const env = getAuthEnv()
  return buildTrustedOrigins(
    getAuthBaseURL(),
    getOAuthProxyURL(),
    env.NEXT_PUBLIC_APP_URL,
    env.NEXT_PUBLIC_CONSOLE_URL,
    env.NEXT_PUBLIC_ADMIN_URL,
    env.NEXT_PUBLIC_DOCS_URL,
    env.NEXT_PUBLIC_MARKETING_URL
  )
}

export function buildTrustedOrigins(...urls: Array<string | undefined>) {
  return Array.from(
    new Set(urls.filter((url): url is string => Boolean(url)).map((url) => new URL(url).origin))
  )
}

export function getSocialProviderCredentials() {
  const env = getAuthEnv()
  return {
    github: optionalProviderCredentials(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    google: optionalProviderCredentials(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
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
