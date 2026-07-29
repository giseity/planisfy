import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { accounts, apiKeys, db, users } from '@planisfy/database'
import { logAudit } from '../../shared/audit'
import {
  ALL_SCOPES,
  metadataAllowedDomains,
  metadataWithAllowedDomains,
  normalizeAllowedDomains,
  ORG_API_KEY_CONFIG_ID,
  permissionsToScopes,
  scopesToPermissions,
  USER_API_KEY_CONFIG_ID,
} from '../keys/api-key'
import { getAccountPlanLimits } from '../billing/billing'
import { requireOrgMutationPermission, type AuthEnv } from '../../middleware/auth'
import { env } from '../../env'
import { apiKeyMutationGate } from '../../shared/policy/platform-gates'
import {
  ApiKeyMutationError,
  createApiKeyTransaction,
  revokeApiKeyTransaction,
  rotateApiKeyTransaction,
  updateApiKeyTransaction,
} from './service'

export const keysRoute = new Hono<AuthEnv>()
const MAX_API_KEY_LIFETIME_MS = 3650 * 24 * 60 * 60 * 1000

keysRoute.use('/keys', requireOrgMutationPermission('api_key.manage'))
keysRoute.use('/keys/*', requireOrgMutationPermission('api_key.manage'))

type BetterAuthApiKeyRow = Omit<typeof apiKeys.$inferSelect, 'key' | 'metadata' | 'permissions'> & {
  metadata: unknown
  permissions: unknown
}

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined
  )
}

function serializeApiKey(row: BetterAuthApiKeyRow) {
  return {
    id: row.id,
    name: row.name ?? 'Untitled key',
    scopes: permissionsToScopes(row.permissions),
    allowedDomains: metadataAllowedDomains(row.metadata),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastRequest,
    createdAt: row.createdAt,
    status: row.expiresAt && new Date(row.expiresAt) < new Date() ? 'expired' : 'active',
    prefix: row.start ?? row.prefix ?? 'pk_',
  }
}

async function getApiKeyConfig(ownerId: string) {
  const [account] = await db
    .select({ type: accounts.type })
    .from(accounts)
    .where(eq(accounts.id, ownerId))
    .limit(1)

  if (!account) return null
  return account.type === 'ORGANIZATION' ? ORG_API_KEY_CONFIG_ID : USER_API_KEY_CONFIG_ID
}

async function findOwnedEnabledKey(keyId: string, ownerId: string) {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true)))
    .limit(1)

  return key ?? null
}

// -- Validation schemas -------------------------------------------------------

const createKeySchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().min(1).max(128),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1, 'At least one scope is required'),
  allowedDomains: z.array(z.string().max(255)).max(20).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
})

const updateKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1).optional(),
  allowedDomains: z.array(z.string().max(255)).max(20).optional(),
})

const rotateKeySchema = z.object({
  requestId: z.string().uuid(),
})

// -- POST /console/keys - Create ---------------------------------------------

keysRoute.post('/keys', async (c) => {
  const ownerId = c.get('ownerId')
  const userId = c.get('userId')
  const verificationError = await requireManagedEmailVerification(c)
  if (verificationError) return verificationError

  const parsed = createKeySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      },
      400
    )
  }

  const { name, scopes, expiresAt, requestId } = parsed.data
  const expiration = expiresAt ? new Date(expiresAt) : null
  if (
    expiration &&
    (expiration <= new Date() || expiration.getTime() > Date.now() + MAX_API_KEY_LIFETIME_MS)
  ) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Expiration must be in the future and within 3650 days',
        },
      },
      400
    )
  }

  const normalizedDomains = normalizeAllowedDomains(parsed.data.allowedDomains)
  if (normalizedDomains.errors.length > 0) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid allowed domains',
          details: { allowedDomains: normalizedDomains.errors },
        },
      },
      400
    )
  }

  const [limits, configId] = await Promise.all([
    getAccountPlanLimits(ownerId),
    getApiKeyConfig(ownerId),
  ])
  if (!configId) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Account not found' } }, 404)
  }

  let created
  try {
    created = await createApiKeyTransaction({
      ownerId,
      configId,
      name,
      permissions: scopesToPermissions(scopes),
      metadata: metadataWithAllowedDomains(normalizedDomains.domains),
      expiresAt: expiration,
      maxApiKeys: limits.maxApiKeys,
      requestId,
    })
  } catch (error) {
    if (error instanceof ApiKeyMutationError && error.code === 'ACCOUNT_NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
    }
    if (error instanceof ApiKeyMutationError && error.code === 'PLAN_LIMIT') {
      return c.json(
        {
          error: {
            code: 'PLAN_LIMIT',
            message: `You've reached the maximum of ${error.limit} API keys on your current plan. Please upgrade to create more.`,
          },
        },
        403
      )
    }
    throw error
  }

  if (created.duplicate) {
    return c.json(
      {
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'This API key creation request was already completed.',
          details: { keyId: created.keyId },
        },
      },
      409
    )
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: 'key.created',
    resourceType: 'api_key',
    resourceId: created.row.id,
    metadata: { name, scopes },
    ipAddress: getClientIp(c.req.raw),
  })

  return c.json(
    {
      data: {
        id: created.row.id,
        key: created.key,
        name,
        scopes,
        allowedDomains: normalizedDomains.domains,
        expiresAt: expiresAt ?? null,
        createdAt: created.row.createdAt.toISOString(),
        prefix: created.row.start ?? created.row.prefix ?? 'pk_',
      },
    },
    201
  )
})

// -- GET /console/keys - List ------------------------------------------------

keysRoute.get('/keys', async (c) => {
  const ownerId = c.get('ownerId')

  const results = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true)))
    .orderBy(desc(apiKeys.createdAt))

  return c.json({ data: results.map(serializeApiKey) })
})

// -- GET /console/keys/:id - Get single key ----------------------------------

keysRoute.get('/keys/:id', async (c) => {
  const key = await findOwnedEnabledKey(c.req.param('id'), c.get('ownerId'))

  if (!key) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404)
  }

  return c.json({ data: serializeApiKey(key) })
})

// -- PUT /console/keys/:id - Update ------------------------------------------

keysRoute.put('/keys/:id', async (c) => {
  const keyId = c.req.param('id')
  const ownerId = c.get('ownerId')
  const userId = c.get('userId')
  const verificationError = await requireManagedEmailVerification(c)
  if (verificationError) return verificationError

  const parsed = updateKeySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      },
      400
    )
  }

  const updates: {
    name?: string
    permissions?: ReturnType<typeof scopesToPermissions>
    metadata?: ReturnType<typeof metadataWithAllowedDomains>
  } = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.scopes !== undefined) {
    updates.permissions = scopesToPermissions(parsed.data.scopes)
  }
  if (parsed.data.allowedDomains !== undefined) {
    const normalizedDomains = normalizeAllowedDomains(parsed.data.allowedDomains)
    if (normalizedDomains.errors.length > 0) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid allowed domains',
            details: { allowedDomains: normalizedDomains.errors },
          },
        },
        400
      )
    }
    updates.metadata = metadataWithAllowedDomains(normalizedDomains.domains)
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400)
  }

  let result
  try {
    result = await updateApiKeyTransaction({
      keyId,
      ownerId,
      updates,
    })
  } catch (error) {
    if (error instanceof ApiKeyMutationError && error.code === 'API_KEY_NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
    }
    throw error
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: 'key.updated',
    resourceType: 'api_key',
    resourceId: keyId,
    metadata: updates,
    ipAddress: getClientIp(c.req.raw),
  })

  return c.json({ data: serializeApiKey(result) })
})

// -- DELETE /console/keys/:id - Revoke ---------------------------------------

keysRoute.delete('/keys/:id', async (c) => {
  const keyId = c.req.param('id')
  const ownerId = c.get('ownerId')
  const userId = c.get('userId')

  let revoked
  try {
    revoked = await revokeApiKeyTransaction({
      keyId,
      ownerId,
    })
  } catch (error) {
    if (error instanceof ApiKeyMutationError && error.code === 'API_KEY_NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
    }
    throw error
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: 'key.revoked',
    resourceType: 'api_key',
    resourceId: keyId,
    metadata: { name: revoked.name },
    ipAddress: getClientIp(c.req.raw),
  })

  return c.json({ data: { id: keyId, revoked: true } })
})

// -- POST /console/keys/:id/rotate - Rotate ----------------------------------

keysRoute.post('/keys/:id/rotate', async (c) => {
  const keyId = c.req.param('id')
  const ownerId = c.get('ownerId')
  const userId = c.get('userId')
  const verificationError = await requireManagedEmailVerification(c)
  if (verificationError) return verificationError

  const parsed = rotateKeySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      },
      400
    )
  }

  let replacement
  try {
    replacement = await rotateApiKeyTransaction({
      keyId,
      ownerId,
      requestId: parsed.data.requestId,
    })
  } catch (error) {
    if (
      error instanceof ApiKeyMutationError &&
      (error.code === 'API_KEY_NOT_FOUND' || error.code === 'API_KEY_EXPIRED')
    ) {
      return c.json(
        {
          error: {
            code: error.code === 'API_KEY_EXPIRED' ? 'API_KEY_EXPIRED' : 'NOT_FOUND',
            message: error.message,
          },
        },
        error.code === 'API_KEY_EXPIRED' ? 409 : 404
      )
    }
    throw error
  }

  if (replacement.duplicate) {
    return c.json(
      {
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'This API key rotation request was already completed.',
          details: { keyId: replacement.keyId },
        },
      },
      409
    )
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: 'key.rotated',
    resourceType: 'api_key',
    resourceId: keyId,
    metadata: {
      name: replacement.row.name,
      replacementId: replacement.row.id,
    },
    ipAddress: getClientIp(c.req.raw),
  })

  return c.json({
    data: {
      id: replacement.row.id,
      key: replacement.key,
      name: replacement.row.name,
    },
  })
})

async function requireManagedEmailVerification(c: Context<AuthEnv>) {
  if (env.DEPLOYMENT_MODE !== 'managed') return null

  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, c.get('userId')))
    .limit(1)

  const denial = apiKeyMutationGate({
    deploymentMode: env.DEPLOYMENT_MODE,
    emailVerified: Boolean(user?.emailVerified),
  })
  if (!denial) return null

  return c.json(
    {
      error: {
        code: denial.code,
        message: denial.message,
      },
    },
    denial.status
  )
}
