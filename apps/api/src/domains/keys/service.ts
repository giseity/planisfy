import { randomUUID } from 'node:crypto'
import { defaultKeyHasher } from '@better-auth/api-key'
import { generateRandomString } from 'better-auth/crypto'
import { accounts, apiKeys, db } from '@planisfy/database'
import { and, count, eq, gt, isNull, or } from 'drizzle-orm'

import {
  metadataAllowedDomains,
  metadataWithAllowedDomains,
  permissionsToScopes,
  scopesToPermissions,
  ALL_SCOPES,
  type ApiKeyMetadata,
  type ApiKeyPermissions,
  type ApiKeyScope,
} from './api-key'

const API_KEY_PREFIX = 'pk_'
const API_KEY_RANDOM_LENGTH = 64
const API_KEY_START_LENGTH = 6

export class ApiKeyMutationError extends Error {
  constructor(
    readonly code: 'ACCOUNT_NOT_FOUND' | 'API_KEY_NOT_FOUND' | 'API_KEY_EXPIRED' | 'PLAN_LIMIT',
    message: string,
    readonly limit?: number
  ) {
    super(message)
    this.name = 'ApiKeyMutationError'
  }
}

export type ApiKeyCreationResult =
  | {
      duplicate: true
      keyId: string
    }
  | {
      duplicate: false
      key: string
      row: typeof apiKeys.$inferSelect
    }

export async function createApiKeyTransaction(params: {
  ownerId: string
  configId: string
  name: string
  permissions: ApiKeyPermissions
  metadata: ApiKeyMetadata
  expiresAt: Date | null
  maxApiKeys: number
  requestId: string
}): Promise<ApiKeyCreationResult> {
  return db.transaction(async (tx) => {
    await lockActiveOwner(tx, params.ownerId)

    const duplicate = await findCreationRequest(tx, params.ownerId, params.requestId)
    if (duplicate) return { duplicate: true, keyId: duplicate.id }

    if (params.maxApiKeys !== Infinity) {
      const now = new Date()
      const [row] = await tx
        .select({ count: count() })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.referenceId, params.ownerId),
            eq(apiKeys.enabled, true),
            or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
          )
        )
      if ((row?.count ?? 0) >= params.maxApiKeys) {
        throw new ApiKeyMutationError(
          'PLAN_LIMIT',
          `API key limit of ${params.maxApiKeys} reached`,
          params.maxApiKeys
        )
      }
    }

    return insertApiKey(tx, params)
  })
}

export async function rotateApiKeyTransaction(params: {
  keyId: string
  ownerId: string
  requestId: string
}): Promise<ApiKeyCreationResult> {
  return db.transaction(async (tx) => {
    await lockActiveOwner(tx, params.ownerId)

    const duplicate = await findCreationRequest(tx, params.ownerId, params.requestId)
    if (duplicate) return { duplicate: true, keyId: duplicate.id }

    const [existing] = await tx
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, params.keyId),
          eq(apiKeys.referenceId, params.ownerId),
          eq(apiKeys.enabled, true)
        )
      )
      .for('update')
      .limit(1)
    if (!existing) {
      throw new ApiKeyMutationError('API_KEY_NOT_FOUND', 'API key not found')
    }
    if (existing.expiresAt && existing.expiresAt <= new Date()) {
      throw new ApiKeyMutationError(
        'API_KEY_EXPIRED',
        'Expired API keys cannot be rotated; create a new key instead'
      )
    }

    const replacement = await insertApiKey(tx, {
      ownerId: params.ownerId,
      configId: existing.configId,
      name: existing.name ?? 'Untitled key',
      permissions: scopesToPermissions(
        permissionsToScopes(existing.permissions).filter(
          (scope): scope is ApiKeyScope => ALL_SCOPES.includes(scope as ApiKeyScope)
        )
      ),
      metadata: metadataWithAllowedDomains(metadataAllowedDomains(existing.metadata)),
      expiresAt: existing.expiresAt,
      requestId: params.requestId,
    })

    await tx
      .update(apiKeys)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(apiKeys.id, existing.id))

    return replacement
  })
}

export async function updateApiKeyTransaction(params: {
  keyId: string
  ownerId: string
  updates: {
    name?: string
    permissions?: ApiKeyPermissions
    metadata?: ApiKeyMetadata
  }
}) {
  return db.transaction(async (tx) => {
    await lockActiveOwner(tx, params.ownerId)
    const [updated] = await tx
      .update(apiKeys)
      .set({
        ...params.updates,
        permissions:
          params.updates.permissions === undefined
            ? undefined
            : JSON.stringify(params.updates.permissions),
        metadata:
          params.updates.metadata === undefined
            ? undefined
            : JSON.stringify(params.updates.metadata),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apiKeys.id, params.keyId),
          eq(apiKeys.referenceId, params.ownerId),
          eq(apiKeys.enabled, true)
        )
      )
      .returning()
    if (!updated) {
      throw new ApiKeyMutationError('API_KEY_NOT_FOUND', 'API key not found')
    }
    return updated
  })
}

export async function revokeApiKeyTransaction(params: { keyId: string; ownerId: string }) {
  return db.transaction(async (tx) => {
    await lockActiveOwner(tx, params.ownerId)
    const [revoked] = await tx
      .update(apiKeys)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, params.keyId),
          eq(apiKeys.referenceId, params.ownerId),
          eq(apiKeys.enabled, true)
        )
      )
      .returning()
    if (!revoked) {
      throw new ApiKeyMutationError('API_KEY_NOT_FOUND', 'API key not found')
    }
    return revoked
  })
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function lockActiveOwner(tx: Transaction, ownerId: string) {
  const [account] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, ownerId),
        eq(accounts.lifecycleStatus, 'ACTIVE'),
        isNull(accounts.deletedAt)
      )
    )
    .for('update')
    .limit(1)
  if (!account) {
    throw new ApiKeyMutationError('ACCOUNT_NOT_FOUND', 'Account not found')
  }
}

async function findCreationRequest(tx: Transaction, ownerId: string, requestId: string) {
  const [row] = await tx
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.creationRequestId, requestId)))
    .limit(1)
  return row ?? null
}

async function insertApiKey(
  tx: Transaction,
  params: {
    ownerId: string
    configId: string
    name: string
    permissions: ApiKeyPermissions
    metadata: ApiKeyMetadata
    expiresAt: Date | null
    requestId: string
  }
): Promise<Extract<ApiKeyCreationResult, { duplicate: false }>> {
  const rawKey = `${API_KEY_PREFIX}${generateRandomString(API_KEY_RANDOM_LENGTH, 'a-z', 'A-Z')}`
  const now = new Date()
  const [row] = await tx
    .insert(apiKeys)
    .values({
      id: randomUUID(),
      configId: params.configId,
      name: params.name,
      start: rawKey.slice(0, API_KEY_START_LENGTH),
      prefix: API_KEY_PREFIX,
      key: await defaultKeyHasher(rawKey),
      creationRequestId: params.requestId,
      referenceId: params.ownerId,
      enabled: true,
      rateLimitEnabled: false,
      requestCount: 0,
      remaining: null,
      expiresAt: params.expiresAt,
      createdAt: now,
      updatedAt: now,
      permissions: JSON.stringify(params.permissions),
      metadata: JSON.stringify(params.metadata),
    })
    .returning()
  if (!row) throw new Error('API key insertion did not return a row')
  return { duplicate: false, key: rawKey, row }
}
