import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { auth } from '@planisfy/auth/server'
import { accounts, apiKeys, db } from '@planisfy/database'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import {
  evaluateApiKeyPolicy,
  ORG_API_KEY_CONFIG_ID,
  USER_API_KEY_CONFIG_ID,
} from '../domains/keys/api-key'
import { env } from '../env'

export type ApiKeyEnv = {
  Variables: {
    apiKeyId: string | null
    apiKeyOwnerId: string | null
    apiKeyScopes: string[] | null
  }
}

type VerifiedApiKey = NonNullable<Awaited<ReturnType<typeof auth.api.verifyApiKey>>['key']>
type VerifiedApiKeyIdentity = Pick<VerifiedApiKey, 'id' | 'referenceId'>

const MAX_CACHED_API_KEYS = 5_000
const verifiedApiKeyCache = new Map<string, { key: VerifiedApiKeyIdentity; expiresAt: number }>()

/**
 * Validates an API key from the X-API-Key header.
 * Sets apiKeyId, apiKeyOwnerId, apiKeyScopes on the context.
 *
 * Missing keys are allowed so dual-auth middleware can fall back to sessions.
 * Invalid, disabled, expired, wrong-domain, or under-scoped keys are rejected.
 */
export const apiKeyMiddleware = createMiddleware<ApiKeyEnv>(async (c, next) => {
  c.set('apiKeyId', null)
  c.set('apiKeyOwnerId', null)
  c.set('apiKeyScopes', null)

  const rawKey = c.req.header('x-api-key')
  if (!rawKey) {
    await next()
    return
  }

  if (!rawKey.startsWith('pk_')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' } }, 401)
  }

  const cacheKey = apiKeyCacheKey(rawKey)
  const cached = readVerifiedApiKeyCache(cacheKey)
  const verified = cached
    ? { valid: true as const, key: cached }
    : await verifyApiKeyAcrossConfigs(rawKey)
  if ('status' in verified) {
    return c.json(
      {
        error: {
          code: verified.code,
          message: verified.message,
        },
      },
      verified.status
    )
  }

  const [liveKey] = await db
    .select({
      id: apiKeys.id,
      referenceId: apiKeys.referenceId,
      permissions: apiKeys.permissions,
      metadata: apiKeys.metadata,
    })
    .from(apiKeys)
    .innerJoin(accounts, eq(accounts.id, apiKeys.referenceId))
    .where(
      and(
        eq(apiKeys.id, verified.key.id),
        eq(apiKeys.referenceId, verified.key.referenceId),
        eq(apiKeys.enabled, true),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
        eq(accounts.lifecycleStatus, 'ACTIVE'),
        isNull(accounts.deletedAt)
      )
    )
    .limit(1)

  if (!liveKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)
  }

  if (!cached) {
    writeVerifiedApiKeyCache(cacheKey, verified.key)
  }

  const policy = evaluateApiKeyPolicy({
    permissions: liveKey.permissions,
    metadata: liveKey.metadata,
    path: c.req.path,
    origin: c.req.header('origin') || c.req.header('referer'),
  })
  if (!policy.allowed) {
    return c.json(
      {
        error: {
          code: policy.code,
          message: policy.message,
        },
      },
      policy.status
    )
  }

  c.set('apiKeyId', liveKey.id)
  c.set('apiKeyOwnerId', liveKey.referenceId)
  c.set('apiKeyScopes', policy.scopes)

  await next()
})

function apiKeyCacheKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex')
}

function readVerifiedApiKeyCache(cacheKey: string) {
  const cached = verifiedApiKeyCache.get(cacheKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    verifiedApiKeyCache.delete(cacheKey)
    return null
  }
  return cached.key
}

function writeVerifiedApiKeyCache(cacheKey: string, key: VerifiedApiKeyIdentity) {
  if (verifiedApiKeyCache.size >= MAX_CACHED_API_KEYS) {
    const now = Date.now()
    for (const [entryKey, cached] of verifiedApiKeyCache) {
      if (cached.expiresAt <= now) verifiedApiKeyCache.delete(entryKey)
    }
    if (verifiedApiKeyCache.size >= MAX_CACHED_API_KEYS) {
      verifiedApiKeyCache.delete(verifiedApiKeyCache.keys().next().value ?? '')
    }
  }
  verifiedApiKeyCache.set(cacheKey, {
    key: { id: key.id, referenceId: key.referenceId },
    expiresAt: Date.now() + env.API_KEY_AUTH_CACHE_TTL_MS,
  })
}

export function clearVerifiedApiKeyCache() {
  verifiedApiKeyCache.clear()
}

async function verifyApiKeyAcrossConfigs(
  rawKey: string
): Promise<
  | { valid: true; key: VerifiedApiKeyIdentity }
  | { valid: false; status: 401; code: string; message: string }
> {
  let lastError: { code?: string; message?: string } | null = null

  for (const configId of [USER_API_KEY_CONFIG_ID, ORG_API_KEY_CONFIG_ID]) {
    const result = await auth.api.verifyApiKey({
      body: {
        configId,
        key: rawKey,
      },
    })

    if (result.valid && result.key) {
      return {
        valid: true,
        key: { id: result.key.id, referenceId: result.key.referenceId },
      }
    }
    lastError = result.error
      ? {
          code: result.error.code,
          message: result.error.message ? String(result.error.message) : undefined,
        }
      : null
  }

  const code = lastError?.code ?? 'UNAUTHORIZED'
  const publicCode = code === 'KEY_DISABLED' || code === 'KEY_EXPIRED' ? code : 'UNAUTHORIZED'
  return {
    valid: false,
    status: 401,
    code: publicCode,
    message:
      code === 'KEY_DISABLED' ? 'API key is disabled' : lastError?.message || 'Invalid API key',
  }
}
