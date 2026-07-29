#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import {
  OutboundRequestError,
  readResponseBody,
  resolveOutboundTarget,
  withOutboundResponse,
  type OutboundLookup,
} from '@planisfy/outbound'

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576
const DEFAULT_TIMEOUT_MS = 10_000

export interface ManagedIngressOptions {
  allowInsecure?: boolean
  allowLocal?: boolean
  bodyIdleTimeoutMs?: number
  lookup?: OutboundLookup
  maxResponseBytes?: number
  privateAllowlist?: string | readonly string[]
  timeoutMs?: number
}

interface ManagedIngressResponse {
  body: Buffer
  headers: NodeJS.Dict<string | string[]>
  status: number
}

export async function validateManagedIngressUrl(
  value: string,
  name: string,
  options: ManagedIngressOptions = {}
): Promise<URL> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not include credentials`)
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without a path, query, or fragment`)
  }

  if (options.allowLocal) {
    if (!options.allowInsecure && url.protocol !== 'https:') {
      throw new Error(`${name} must use https unless local insecure smoke is explicitly enabled`)
    }
    if (!options.privateAllowlist || options.privateAllowlist.length === 0) {
      throw new Error(`${name} local smoke requires an explicit private allowlist`)
    }
  } else {
    if (url.protocol !== 'https:') {
      throw new Error(`${name} must use https for managed staging`)
    }
    if (url.port) {
      throw new Error(`${name} must not use a nonstandard port`)
    }
  }

  await resolveOutboundTarget(url, outboundPolicy(options))
  return new URL(url.origin)
}

export async function managedIngressRequest(
  origin: URL,
  path: string,
  label: string,
  init: { headers?: Record<string, string> } = {},
  options: ManagedIngressOptions = {}
): Promise<ManagedIngressResponse> {
  const target = new URL(path, `${origin.origin}/`)
  return withOutboundResponse(
    target,
    {
      ...outboundPolicy(options),
      headers: init.headers,
      maxRedirects: 3,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      bodyIdleTimeoutMs: options.bodyIdleTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
    async (response, finalUrl) => {
      const body = await readResponseBody(
        response,
        options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
      )
      if (finalUrl.origin !== origin.origin) {
        throw new Error(
          `${label} redirected outside the configured ingress origin to ${finalUrl.origin}`
        )
      }
      return {
        body,
        headers: response.headers,
        status: response.statusCode ?? 0,
      }
    }
  )
}

async function main() {
  const options = managedIngressOptionsFromEnv()
  const apiUrl = await validateManagedIngressUrl(
    requiredEnv('MANAGED_STAGING_API_URL'),
    'MANAGED_STAGING_API_URL',
    options
  )
  const consoleUrl = await validateManagedIngressUrl(
    requiredEnv('MANAGED_STAGING_CONSOLE_URL'),
    'MANAGED_STAGING_CONSOLE_URL',
    options
  )
  const internalSecret = requiredEnv('INTERNAL_API_SECRET')

  await expectOk(apiUrl, '/health', 'health', undefined, options)
  await expectOk(consoleUrl, '/', 'console ingress', undefined, options)
  await expectCors(apiUrl, '/health', consoleUrl.origin, options)

  const preflight = await expectJson(
    apiUrl,
    '/setup/preflight',
    'setup preflight',
    { 'x-internal-secret': internalSecret },
    options
  )
  const preflightData = preflight.data
  if (preflightData?.deploymentMode !== 'managed') {
    throw new Error(`Expected managed deployment mode, got ${preflightData?.deploymentMode}`)
  }
  if ((preflightData?.summary?.blocking ?? 1) > 0) {
    throw new Error(`Managed preflight has ${preflightData.summary.blocking} blocking issue(s)`)
  }

  const smoke = await expectJson(
    apiUrl,
    '/internal/managed-smoke',
    'managed smoke',
    { 'x-internal-secret': internalSecret },
    options
  )
  const data = smoke.data
  if (data?.deploymentMode !== 'managed') {
    throw new Error(`Managed smoke reported ${data?.deploymentMode} deployment mode`)
  }
  if (!data?.storage?.ok) {
    throw new Error('Managed storage write/read smoke failed')
  }
  if (!data?.billing?.ok) {
    throw new Error('Managed billing checkout availability smoke failed')
  }
  if (!data?.email?.ok) {
    throw new Error('Managed email adapter availability smoke failed')
  }

  console.log('Managed staging smoke passed')
  console.log(`api=${apiUrl.origin}`)
  console.log(`console=${consoleUrl.origin}`)
  console.log(`storage=${data.storage.provider}/${data.storage.bucket}`)
  console.log(
    `billingPlans=${data.billing.plans
      .filter((plan: { id: string }) => plan.id !== 'free')
      .map(
        (plan: { checkoutAvailable: boolean; id: string }) => `${plan.id}:${plan.checkoutAvailable}`
      )
      .join(',')}`
  )
  console.log(`emailFrom=${data.email.fromEmail}`)
}

async function expectOk(
  origin: URL,
  path: string,
  label: string,
  headers: Record<string, string> | undefined,
  options: ManagedIngressOptions
) {
  const response = await managedIngressRequest(origin, path, label, { headers }, options)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with HTTP ${response.status}`)
  }
  return response
}

async function expectJson(
  origin: URL,
  path: string,
  label: string,
  headers: Record<string, string>,
  options: ManagedIngressOptions
) {
  const response = await expectOk(origin, path, label, headers, options)
  try {
    return JSON.parse(response.body.toString('utf8'))
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

async function expectCors(
  origin: URL,
  path: string,
  consoleOrigin: string,
  options: ManagedIngressOptions
) {
  const response = await expectOk(origin, path, 'CORS probe', { origin: consoleOrigin }, options)
  const allowOrigin = response.headers['access-control-allow-origin']
  if (allowOrigin !== consoleOrigin) {
    throw new Error(
      `CORS probe expected access-control-allow-origin=${consoleOrigin}, got ${allowOrigin}`
    )
  }
}

function outboundPolicy(options: ManagedIngressOptions) {
  return {
    lookup: options.lookup,
    privateAllowlist: options.allowLocal ? options.privateAllowlist : undefined,
  }
}

function managedIngressOptionsFromEnv(): ManagedIngressOptions {
  return {
    allowInsecure: process.env.ALLOW_INSECURE_MANAGED_STAGING === 'true',
    allowLocal: process.env.ALLOW_LOCAL_MANAGED_SMOKE === 'true',
    privateAllowlist: process.env.OUTBOUND_PRIVATE_ALLOWLIST,
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function isDirectExecution() {
  const entrypoint = process.argv[1]
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href)
}

if (isDirectExecution()) {
  main().catch((error) => {
    if (error instanceof OutboundRequestError) {
      console.error(`Managed staging smoke failed [${error.code}]: ${error.message}`)
    } else {
      console.error(
        `Managed staging smoke failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    process.exitCode = 1
  })
}
