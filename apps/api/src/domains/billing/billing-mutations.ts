import { createHash } from 'node:crypto'
import { billingMutationRequests, db } from '@planisfy/database'
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm'

const MUTATION_LEASE_MS = 10 * 60_000
const CHECKOUT_REUSE_MS = 30 * 60_000
const RATE_LIMIT_WINDOW_MS = 10 * 60_000
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/

export type BillingMutationOperation = 'checkout' | 'change-plan'

export class BillingMutationError extends Error {
  constructor(
    readonly code:
      | 'IDEMPOTENCY_KEY_REQUIRED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'BILLING_MUTATION_IN_PROGRESS'
      | 'OUTSTANDING_CHECKOUT'
      | 'RATE_LIMITED',
    message: string,
    readonly status: 400 | 409 | 429,
    readonly retryAfter?: number
  ) {
    super(message)
  }
}

export function requireIdempotencyKey(value: string | undefined) {
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BillingMutationError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key must contain 16 to 128 letters, numbers, dots, colons, underscores, or hyphens.',
      400
    )
  }
  return value
}

export function billingMutationFingerprint(operation: BillingMutationOperation, body: unknown) {
  return createHash('sha256')
    .update(`${operation}:${JSON.stringify(body)}`)
    .digest('hex')
}

export async function beginBillingMutation(params: {
  accountId: string
  initiatedByAccountId: string
  operation: BillingMutationOperation
  idempotencyKey: string
  requestFingerprint: string
  clientIp: string | null
}) {
  const now = new Date()
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`billingMutation:${params.accountId}`}))`
    )
    if (params.clientIp) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`billingMutationIp:${params.clientIp}`}))`
      )
    }
    await tx
      .update(billingMutationRequests)
      .set({
        status: 'UNKNOWN',
        lastError: 'Mutation lease expired before a definitive result was recorded.',
        updatedAt: now,
      })
      .where(
        and(
          eq(billingMutationRequests.accountId, params.accountId),
          eq(billingMutationRequests.status, 'PROCESSING'),
          lt(billingMutationRequests.leaseUntil, now)
        )
      )

    const [existing] = await tx
      .select()
      .from(billingMutationRequests)
      .where(
        and(
          eq(billingMutationRequests.accountId, params.accountId),
          eq(billingMutationRequests.operation, params.operation),
          eq(billingMutationRequests.idempotencyKey, params.idempotencyKey)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestFingerprint !== params.requestFingerprint) {
        throw new BillingMutationError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
          409
        )
      }
      if (existing.status === 'SUCCEEDED' && existing.responseStatus && existing.responseBody) {
        return {
          kind: 'replay' as const,
          status: existing.responseStatus,
          body: existing.responseBody,
        }
      }
      if (existing.status === 'FAILED') {
        await tx
          .update(billingMutationRequests)
          .set({
            status: 'PROCESSING',
            leaseUntil: new Date(now.getTime() + MUTATION_LEASE_MS),
            lastError: null,
            updatedAt: now,
          })
          .where(eq(billingMutationRequests.id, existing.id))
        return { kind: 'claimed' as const, id: existing.id }
      }
      throw new BillingMutationError(
        'BILLING_MUTATION_IN_PROGRESS',
        existing.status === 'UNKNOWN'
          ? 'The previous billing mutation has an unknown provider outcome. Contact support before retrying.'
          : 'A billing mutation is already in progress for this account.',
        409
      )
    }

    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS)
    const accountRequests = await tx
      .select({ createdAt: billingMutationRequests.createdAt })
      .from(billingMutationRequests)
      .where(
        and(
          eq(billingMutationRequests.accountId, params.accountId),
          gt(billingMutationRequests.createdAt, windowStart)
        )
      )
      .orderBy(asc(billingMutationRequests.createdAt))
      .limit(5)
    const ipRequests = params.clientIp
      ? await tx
          .select({ createdAt: billingMutationRequests.createdAt })
          .from(billingMutationRequests)
          .where(
            and(
              eq(billingMutationRequests.clientIp, params.clientIp),
              gt(billingMutationRequests.createdAt, windowStart)
            )
          )
          .orderBy(asc(billingMutationRequests.createdAt))
          .limit(20)
      : []
    if (accountRequests.length >= 5 || ipRequests.length >= 20) {
      const oldest =
        accountRequests.length >= 5 ? accountRequests[0]!.createdAt : ipRequests[0]!.createdAt
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest.getTime() + RATE_LIMIT_WINDOW_MS - now.getTime()) / 1_000)
      )
      throw new BillingMutationError(
        'RATE_LIMITED',
        'Too many billing requests. Try again later.',
        429,
        retryAfter
      )
    }

    const [blocking] = await tx
      .select({ status: billingMutationRequests.status })
      .from(billingMutationRequests)
      .where(
        and(
          eq(billingMutationRequests.accountId, params.accountId),
          inArray(billingMutationRequests.status, ['PROCESSING', 'UNKNOWN'])
        )
      )
      .limit(1)
    if (blocking) {
      throw new BillingMutationError(
        'BILLING_MUTATION_IN_PROGRESS',
        'Another billing mutation must finish or be reconciled before starting this request.',
        409
      )
    }

    if (params.operation === 'checkout') {
      const [recent] = await tx
        .select()
        .from(billingMutationRequests)
        .where(
          and(
            eq(billingMutationRequests.accountId, params.accountId),
            eq(billingMutationRequests.operation, 'checkout'),
            eq(billingMutationRequests.status, 'SUCCEEDED'),
            gt(billingMutationRequests.createdAt, new Date(now.getTime() - CHECKOUT_REUSE_MS))
          )
        )
        .orderBy(desc(billingMutationRequests.createdAt))
        .limit(1)
      if (recent?.requestFingerprint === params.requestFingerprint && recent.responseBody) {
        return {
          kind: 'replay' as const,
          status: recent.responseStatus ?? 200,
          body: recent.responseBody,
        }
      }
      if (recent) {
        throw new BillingMutationError(
          'OUTSTANDING_CHECKOUT',
          'A different checkout is already outstanding for this account.',
          409
        )
      }
    }

    const [created] = await tx
      .insert(billingMutationRequests)
      .values({
        accountId: params.accountId,
        initiatedByAccountId: params.initiatedByAccountId,
        operation: params.operation,
        idempotencyKey: params.idempotencyKey,
        requestFingerprint: params.requestFingerprint,
        clientIp: params.clientIp,
        status: 'PROCESSING',
        leaseUntil: new Date(now.getTime() + MUTATION_LEASE_MS),
      })
      .returning({ id: billingMutationRequests.id })
    if (!created) throw new Error('Failed to claim billing mutation')
    return { kind: 'claimed' as const, id: created.id }
  })
}

export async function completeBillingMutation(id: string, status: number, body: unknown) {
  await db
    .update(billingMutationRequests)
    .set({
      status: 'SUCCEEDED',
      responseStatus: status,
      responseBody: body,
      leaseUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(billingMutationRequests.id, id))
}

export async function failBillingMutation(id: string, error: unknown, ambiguous = true) {
  await db
    .update(billingMutationRequests)
    .set({
      status: ambiguous ? 'UNKNOWN' : 'FAILED',
      leaseUntil: null,
      lastError: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      updatedAt: new Date(),
    })
    .where(eq(billingMutationRequests.id, id))
}
