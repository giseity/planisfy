import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../index'
import {
  accounts,
  apiKeys,
  auditEvents,
  invitations,
  organizations,
  rootAgentNodeTokens,
  rootAgentRegistrationTokens,
  sessions,
  styles,
  workerNodes,
} from '../schema'

export type AccountLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED'
export type AccountType = 'USER' | 'ORGANIZATION'

export class AccountLifecycleError extends Error {
  constructor(
    readonly code: 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_DEACTIVATED' | 'ACCOUNT_TYPE_MISMATCH',
    message: string
  ) {
    super(message)
    this.name = 'AccountLifecycleError'
  }
}

export async function setAccountLifecycle(params: {
  accountId: string
  status: AccountLifecycleStatus
  reason: string | null
  actorId: string
}) {
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, params.accountId)
    if (account.deletedAt) {
      throw new AccountLifecycleError(
        'ACCOUNT_DEACTIVATED',
        'Deactivated accounts cannot change lifecycle state'
      )
    }

    const reason = params.status === 'ACTIVE' ? null : normalizeRequiredReason(params.reason)
    const now = new Date()

    await tx
      .update(accounts)
      .set({
        lifecycleStatus: params.status,
        lifecycleReason: reason,
        lifecycleUntil: null,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id))

    if (params.status !== 'ACTIVE') {
      await revokeSessions(tx, account.id, account.type)
    }

    await tx.insert(auditEvents).values({
      profileId: account.id,
      action: 'account.lifecycle_changed',
      resourceType: 'account',
      resourceId: account.id,
      metadata: {
        actorId: params.actorId,
        previousStatus: account.lifecycleStatus,
        status: params.status,
        reason,
      },
    })

    return {
      accountId: account.id,
      accountType: account.type,
      previousStatus: account.lifecycleStatus,
      status: params.status,
    }
  })
}

export async function deactivateAccount(params: {
  accountId: string
  accountType: AccountType
  actorId: string
  reason?: string
}) {
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, params.accountId)
    if (account.type !== params.accountType) {
      throw new AccountLifecycleError(
        'ACCOUNT_TYPE_MISMATCH',
        'Account type does not match the requested deactivation'
      )
    }
    if (account.deletedAt) {
      return {
        accountId: account.id,
        accountType: account.type,
        deactivatedAt: account.deletedAt,
        alreadyDeactivated: true,
      }
    }

    const now = new Date()
    await tx
      .update(accounts)
      .set({
        deletedAt: now,
        lifecycleReason: params.reason ?? 'Terminal account deactivation',
        lifecycleUntil: null,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id))

    if (account.type === 'ORGANIZATION') {
      await tx
        .update(organizations)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(organizations.id, account.id))
      await tx
        .update(invitations)
        .set({ status: 'canceled' })
        .where(and(eq(invitations.organizationId, account.id), eq(invitations.status, 'pending')))
    }

    await revokeSessions(tx, account.id, account.type)
    await Promise.all([
      tx
        .update(apiKeys)
        .set({ enabled: false, updatedAt: now })
        .where(eq(apiKeys.referenceId, account.id)),
      tx
        .update(rootAgentRegistrationTokens)
        .set({ expiresAt: now })
        .where(eq(rootAgentRegistrationTokens.accountId, account.id)),
      tx
        .update(rootAgentNodeTokens)
        .set({ revokedAt: now })
        .where(
          and(eq(rootAgentNodeTokens.accountId, account.id), isNull(rootAgentNodeTokens.revokedAt))
        ),
      tx
        .update(workerNodes)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(workerNodes.accountId, account.id), isNull(workerNodes.deletedAt))),
      tx
        .update(styles)
        .set({ isPublic: false, updatedAt: now })
        .where(eq(styles.ownerId, account.id)),
    ])

    await tx.insert(auditEvents).values({
      profileId: account.id,
      action: 'account.deactivated',
      resourceType: 'account',
      resourceId: account.id,
      metadata: {
        actorId: params.actorId,
        accountType: account.type,
        retainedData: true,
      },
    })

    return {
      accountId: account.id,
      accountType: account.type,
      deactivatedAt: now,
      alreadyDeactivated: false,
    }
  })
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function lockAccount(tx: Transaction, accountId: string) {
  const [account] = await tx
    .select({
      id: accounts.id,
      type: accounts.type,
      lifecycleStatus: accounts.lifecycleStatus,
      deletedAt: accounts.deletedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for('update')
    .limit(1)

  if (!account) {
    throw new AccountLifecycleError('ACCOUNT_NOT_FOUND', 'Account was not found')
  }
  return account
}

async function revokeSessions(tx: Transaction, accountId: string, accountType: AccountType) {
  if (accountType === 'USER') {
    await tx.delete(sessions).where(eq(sessions.userId, accountId))
    return
  }

  await tx
    .update(sessions)
    .set({ activeOrganizationId: null, updatedAt: new Date() })
    .where(eq(sessions.activeOrganizationId, accountId))
}

function normalizeRequiredReason(reason: string | null) {
  const value = reason?.trim()
  if (!value) {
    throw new Error('A lifecycle reason is required')
  }
  return value
}
