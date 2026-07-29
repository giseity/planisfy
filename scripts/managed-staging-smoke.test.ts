import assert from 'node:assert/strict'
import { createServer, type RequestListener, type Server } from 'node:http'
import { afterEach, test } from 'node:test'
import { OutboundRequestError } from '@planisfy/outbound'
import {
  managedIngressRequest,
  validateManagedIngressUrl,
  type ManagedIngressOptions,
} from './managed-staging-smoke'

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }] as const
const privateLookup = async () => [{ address: '127.0.0.1', family: 4 }] as const
const servers = new Set<Server>()

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolveClose) => {
          server.closeAllConnections()
          server.close(() => resolveClose())
        })
    )
  )
  servers.clear()
})

test('accepts only a clean public HTTPS origin', async () => {
  const url = await validateManagedIngressUrl('https://staging.example', 'STAGING_URL', {
    lookup: publicLookup,
  })
  assert.equal(url.href, 'https://staging.example/')

  for (const value of [
    'http://staging.example',
    'https://user:password@staging.example',
    'https://staging.example/path',
    'https://staging.example?query=yes',
    'https://staging.example#fragment',
    'https://staging.example:8443',
  ]) {
    await assert.rejects(validateManagedIngressUrl(value, 'STAGING_URL', { lookup: publicLookup }))
  }
})

test('rejects private and reserved IPv4 and IPv6 literals', async () => {
  for (const value of [
    'https://127.0.0.2',
    'https://10.0.0.1',
    'https://169.254.169.254',
    'https://192.168.1.1',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
  ]) {
    await assert.rejects(validateManagedIngressUrl(value, 'STAGING_URL'), privateAddressError)
  }
})

test('rejects DNS names with any private answer', async () => {
  await assert.rejects(
    validateManagedIngressUrl('https://staging.example', 'STAGING_URL', {
      lookup: privateLookup,
    }),
    privateAddressError
  )
  await assert.rejects(
    validateManagedIngressUrl('https://staging.example', 'STAGING_URL', {
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.2', family: 4 },
      ],
    }),
    privateAddressError
  )
})

test('requires both local opt-in and a private allowlist for local smoke', async () => {
  const baseOptions = {
    allowInsecure: true,
    allowLocal: true,
    lookup: privateLookup,
  } satisfies ManagedIngressOptions

  await assert.rejects(
    validateManagedIngressUrl('http://local.test:4000', 'STAGING_URL', baseOptions),
    /private allowlist/
  )

  const url = await validateManagedIngressUrl('http://local.test:4000', 'STAGING_URL', {
    ...baseOptions,
    privateAllowlist: 'local.test',
  })
  assert.equal(url.href, 'http://local.test:4000/')
})

test('uses pinned local fixtures and accepts same-origin redirects', async () => {
  const { origin, options } = await localFixture((request, response) => {
    if (request.url === '/health') {
      response.writeHead(302, { location: '/ready' })
      response.end()
      return
    }
    response.end('ok')
  })

  const result = await managedIngressRequest(origin, '/health', 'health', {}, options)
  assert.equal(result.status, 200)
  assert.equal(result.body.toString(), 'ok')
})

test('revalidates redirect DNS and rejects private destinations', async () => {
  const { origin, options } = await localFixture((_request, response) => {
    response.writeHead(302, { location: 'http://private.test/secret' })
    response.end()
  })
  const lookup = async (hostname: string) =>
    hostname === 'safe.test'
      ? ([{ address: '127.0.0.1', family: 4 }] as const)
      : ([{ address: '10.0.0.1', family: 4 }] as const)

  await assert.rejects(
    managedIngressRequest(origin, '/redirect', 'redirect', {}, { ...options, lookup }),
    privateAddressError
  )
})

test('bounds ingress response bodies', async () => {
  const { origin, options } = await localFixture((_request, response) => {
    response.end('response is too large')
  })

  await assert.rejects(
    managedIngressRequest(
      origin,
      '/large',
      'large response',
      {},
      {
        ...options,
        maxResponseBytes: 4,
      }
    ),
    (error) => error instanceof OutboundRequestError && error.code === 'RESPONSE_TOO_LARGE'
  )
})

async function localFixture(
  handler: RequestListener
): Promise<{ options: ManagedIngressOptions; origin: URL }> {
  const server = createServer(handler)
  servers.add(server)
  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const options = {
    allowInsecure: true,
    allowLocal: true,
    lookup: privateLookup,
    privateAllowlist: 'safe.test',
    timeoutMs: 500,
  } satisfies ManagedIngressOptions
  const origin = await validateManagedIngressUrl(
    `http://safe.test:${address.port}`,
    'STAGING_URL',
    options
  )
  return { options, origin }
}

function privateAddressError(error: unknown) {
  return error instanceof OutboundRequestError && error.code === 'PRIVATE_ADDRESS'
}
