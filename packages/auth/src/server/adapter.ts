import { and, eq, inArray, isNull } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { BetterAuthOptions } from 'better-auth'
import {
  accounts,
  apiKeys,
  db,
  invitations,
  members,
  oauthAccounts,
  organizations,
  sessions,
  twoFactors,
  users,
  verifications,
} from '@planisfy/database'

export const PLANISFY_ACCOUNT_ANCHOR_FIELD = '__planisfyAccountAnchor'

export interface PlanisfyAccountAnchor {
  id: string
  type: 'USER' | 'ORGANIZATION'
  handle: string
  displayName: string
  avatarUrl: string | null
}

const authSchema = {
  user: users,
  session: sessions,
  account: oauthAccounts,
  verification: verifications,
  organization: organizations,
  member: members,
  invitation: invitations,
  twoFactor: twoFactors,
  apikey: apiKeys,
}

type AuthAdapter = ReturnType<ReturnType<typeof drizzleAdapter>>
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DatabaseExecutor = typeof db | Transaction
type CreateInput = {
  model: string
  data: Record<string, unknown>
  select?: string[]
  forceAllowId?: boolean
}
type FindOneInput = Parameters<AuthAdapter['findOne']>[0]
type FindManyInput = Parameters<AuthAdapter['findMany']>[0]

export function planisfyAuthAdapter() {
  return (options: BetterAuthOptions): AuthAdapter => buildAdapter(db, options, true) as AuthAdapter
}

function buildAdapter(
  executor: DatabaseExecutor,
  options: BetterAuthOptions,
  canStartTransaction: boolean
) {
  const base = drizzleAdapter(executor, {
    provider: 'pg',
    schema: authSchema,
    transaction: false,
  })(options)

  const create = async (input: CreateInput) => {
    if (input.model === 'user' || input.model === 'organization' || input.model === 'session') {
      if (canStartTransaction) {
        return db.transaction((tx) => performGuardedCreate(tx, options, input))
      }
      return performGuardedCreate(executor, options, input)
    }
    return base.create<Record<string, unknown>>({
      ...input,
      data: input.data,
    })
  }

  const findOne = async (input: FindOneInput) => {
    const result = await base.findOne<Record<string, unknown>>(input)
    if (!result || !isLifecycleModel(input.model)) return result
    return (await recordBelongsToActiveAccount(executor, input.model, result)) ? result : null
  }

  const findMany = async (input: FindManyInput) => {
    const results = await base.findMany<Record<string, unknown>>(input)
    if (!isLifecycleModel(input.model) || results.length === 0) return results
    return filterActiveAccountRecords(executor, input.model, results)
  }

  const transaction = async <R>(
    callback: (adapter: Omit<AuthAdapter, 'transaction'>) => Promise<R>
  ) => {
    if (!canStartTransaction) {
      return callback(withoutTransaction(buildAdapter(executor, options, false)))
    }
    return db.transaction((tx) => callback(withoutTransaction(buildAdapter(tx, options, false))))
  }

  return {
    ...base,
    create: create as AuthAdapter['create'],
    findOne: findOne as AuthAdapter['findOne'],
    findMany: findMany as AuthAdapter['findMany'],
    transaction,
  }
}

async function performGuardedCreate(
  executor: DatabaseExecutor,
  options: BetterAuthOptions,
  input: CreateInput
) {
  const base = drizzleAdapter(executor, {
    provider: 'pg',
    schema: authSchema,
    transaction: false,
  })(options)

  if (input.model === 'session') {
    const userId = stringField(input.data, 'userId')
    const [account] = await executor
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, userId),
          eq(accounts.lifecycleStatus, 'ACTIVE'),
          isNull(accounts.deletedAt)
        )
      )
      .for('share')
      .limit(1)
    if (!account) {
      throw new Error('Account is not active')
    }
    return base.create<Record<string, unknown>>(input)
  }

  const { cleanData, anchor } = extractAnchor(input)
  await executor.insert(accounts).values(anchor)
  return base.create<Record<string, unknown>>({
    ...input,
    data: cleanData,
  })
}

function extractAnchor(input: CreateInput) {
  const raw = input.data[PLANISFY_ACCOUNT_ANCHOR_FIELD]
  if (!isAccountAnchor(raw)) {
    throw new Error(`Missing account anchor for Better Auth ${input.model}`)
  }
  if (raw.id !== input.data.id) {
    throw new Error('Account anchor and identity IDs must match')
  }
  if (
    (input.model === 'user' && raw.type !== 'USER') ||
    (input.model === 'organization' && raw.type !== 'ORGANIZATION')
  ) {
    throw new Error('Account anchor type does not match identity model')
  }

  const cleanData = { ...input.data }
  delete cleanData[PLANISFY_ACCOUNT_ANCHOR_FIELD]
  return { cleanData, anchor: raw }
}

function isAccountAnchor(value: unknown): value is PlanisfyAccountAnchor {
  if (!value || typeof value !== 'object') return false
  const anchor = value as Partial<PlanisfyAccountAnchor>
  return (
    typeof anchor.id === 'string' &&
    (anchor.type === 'USER' || anchor.type === 'ORGANIZATION') &&
    typeof anchor.handle === 'string' &&
    typeof anchor.displayName === 'string' &&
    (typeof anchor.avatarUrl === 'string' || anchor.avatarUrl === null)
  )
}

function isLifecycleModel(model: string) {
  return model === 'session' || model === 'organization'
}

async function recordBelongsToActiveAccount(
  executor: DatabaseExecutor,
  model: string,
  record: Record<string, unknown>
) {
  const accountId = model === 'session' ? stringField(record, 'userId') : stringField(record, 'id')
  const [account] = await executor
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.lifecycleStatus, 'ACTIVE'),
        isNull(accounts.deletedAt)
      )
    )
    .limit(1)
  return Boolean(account)
}

async function filterActiveAccountRecords(
  executor: DatabaseExecutor,
  model: string,
  records: Record<string, unknown>[]
) {
  const ids = records.map((record) =>
    model === 'session' ? stringField(record, 'userId') : stringField(record, 'id')
  )
  const active = await executor
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        inArray(accounts.id, ids),
        eq(accounts.lifecycleStatus, 'ACTIVE'),
        isNull(accounts.deletedAt)
      )
    )
  const activeIds = new Set(active.map((account) => account.id))
  return records.filter((record) =>
    activeIds.has(model === 'session' ? stringField(record, 'userId') : stringField(record, 'id'))
  )
}

function stringField(record: Record<string, unknown>, field: string) {
  const value = record[field]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Expected ${field} to be a non-empty string`)
  }
  return value
}

function withoutTransaction(adapter: ReturnType<typeof buildAdapter>) {
  const { transaction, ...rest } = adapter
  void transaction
  return rest
}
