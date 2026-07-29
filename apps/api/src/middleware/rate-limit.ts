import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import Redis from 'ioredis'
import { getEndpointCost, getPostEndpointCost } from '../domains/keys/api-key'
import { getAccountPlanLimits } from '../domains/billing/billing'
import { normalizeRequestsPerMinute } from '../shared/policy/rate-limit-policy'
import {
  checkMonthlyUsageQuota,
  evaluateMonthlyQuota,
  getMonthlyUsagePeriod,
  getMonthlyUsageUnits,
  type QuotaEvaluation,
} from '../domains/usage/usage-quota'
import { redisConnection } from '../env'
import type { AuthEnv } from './auth'

const MONTHLY_QUOTA_CACHE_TTL_SECONDS = 35 * 24 * 60 * 60
const ANONYMOUS_PUBLIC_RPM = 120
const QUOTA_RESERVATION_SCRIPT = `
local key = KEYS[1]
local baseline = tonumber(ARGV[1])
local cost = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local current = tonumber(redis.call("GET", key) or "0")

if current < baseline then
  current = baseline
  redis.call("SET", key, current, "EX", ttl)
else
  redis.call("EXPIRE", key, ttl)
end

local projected = current + cost
if projected > limit then
  return {0, current, projected}
end

redis.call("INCRBY", key, cost)
redis.call("EXPIRE", key, ttl)
return {1, current, projected}
`
const QUOTA_RELEASE_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local cost = tonumber(ARGV[1])
local next = math.max(0, current - cost)
redis.call("SET", KEYS[1], next, "KEEPTTL")
return next
`

const redis = new Redis({
  ...redisConnection,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  retryStrategy: process.env.NODE_ENV === 'test' ? () => null : undefined,
})

redis.on('error', () => {
  // Connection failures are handled through each limiter's in-memory insurance store.
})
if (process.env.NODE_ENV !== 'test') {
  redis.connect().catch((err) => {
    console.warn('[rate-limit] Redis connection failed, using memory fallback:', err.message)
  })
}

const requestLimiters = new Map<number, RateLimiterRedis>()

const blockLimiter = new RateLimiterMemory({
  points: 10,
  duration: 300,
  blockDuration: 600,
})
const dashboardLimiter = createOperationalLimiter('dashboard', 30, 60)
const preflightLimiter = createOperationalLimiter('preflight', 12, 60)
const avatarUserLimiter = createOperationalLimiter('avatar:user', 6, 60 * 60)
const avatarIpLimiter = createOperationalLimiter('avatar:ip', 30, 60 * 60)
const notificationChannelLimiter = createOperationalLimiter('notification:channel', 1, 60)
const notificationAccountLimiter = createOperationalLimiter('notification:account', 10, 60 * 60)
const spriteUploadLimiter = createOperationalLimiter('sprite:upload', 10, 60)
const spritePublicationLimiter = createOperationalLimiter('sprite:publication', 6, 60)

function createOperationalLimiter(prefix: string, points: number, duration: number) {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${prefix}`,
    points,
    duration,
    insuranceLimiter: new RateLimiterMemory({ points, duration }),
  })
}

function getMonthlyQuotaKey(ownerId: string, periodKey: string): string {
  return `quota:${ownerId}:${periodKey}`
}

function setQuotaHeaders(c: Context<AuthEnv>, quota: QuotaEvaluation) {
  c.header('X-Quota-Limit', quota.limit === Infinity ? 'unlimited' : String(quota.limit))
  c.header('X-Quota-Used', String(quota.projected))
  c.header(
    'X-Quota-Remaining',
    quota.remaining === Infinity ? 'unlimited' : String(quota.remaining)
  )
}

function getRequestLimiter(requestsPerMinute: number) {
  const points = normalizeRequestsPerMinute(requestsPerMinute)
  const existing = requestLimiters.get(points)
  if (existing) return existing

  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${points}rpm`,
    points,
    duration: 60,
    insuranceLimiter: new RateLimiterMemory({
      points,
      duration: 60,
    }),
  })
  requestLimiters.set(points, limiter)
  return limiter
}

async function reserveMonthlyQuota(params: {
  ownerId: string
  cost: number
  monthlyLimit: number
}): Promise<QuotaEvaluation & { reservationKey: string | null }> {
  if (params.monthlyLimit === Infinity) {
    return {
      ...evaluateMonthlyQuota({
        used: 0,
        cost: params.cost,
        limit: params.monthlyLimit,
      }),
      reservationKey: null,
    }
  }

  const period = getMonthlyUsagePeriod()
  const durableUsed = await getMonthlyUsageUnits(params.ownerId, period.start)

  try {
    const key = getMonthlyQuotaKey(params.ownerId, period.key)
    const reservation = await redis.eval(
      QUOTA_RESERVATION_SCRIPT,
      1,
      key,
      String(durableUsed),
      String(params.cost),
      String(params.monthlyLimit),
      String(MONTHLY_QUOTA_CACHE_TTL_SECONDS)
    )
    const [allowedRaw, usedRaw] = parseQuotaReservation(reservation)
    const usedBeforeRequest = usedRaw
    const quota = evaluateMonthlyQuota({
      used: usedBeforeRequest,
      cost: params.cost,
      limit: params.monthlyLimit,
    })

    return {
      ...quota,
      allowed: allowedRaw === 1 && quota.allowed,
      reservationKey: allowedRaw === 1 ? key : null,
    }
  } catch {
    return {
      ...(await checkMonthlyUsageQuota({
        ownerId: params.ownerId,
        cost: params.cost,
        limit: params.monthlyLimit,
      })),
      reservationKey: null,
    }
  }
}

async function releaseMonthlyQuota(reservationKey: string | null, cost: number) {
  if (!reservationKey || cost <= 0) return
  try {
    await redis.eval(QUOTA_RELEASE_SCRIPT, 1, reservationKey, String(cost))
  } catch {
    // A durable successful usage log is the billing source of truth. If Redis
    // is unavailable, the next reservation resets its baseline from Postgres.
  }
}

export function parseQuotaReservation(result: unknown): [number, number] {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('Invalid quota reservation result')
  }
  const allowed = Number(result[0])
  const used = Number(result[1])
  if (!Number.isFinite(allowed) || !Number.isFinite(used)) {
    throw new Error('Invalid quota reservation result')
  }
  return [allowed, used]
}

export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const cost = await getRequestCost(c)
  c.set('requestCost', cost)
  c.set('billableUsage', true)
  c.set('chargeUsageOnFailure', false)
  const clientIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'

  try {
    await blockLimiter.consume(clientIp, 0)
  } catch {
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      },
      429
    )
  }

  const ownerId = c.get('ownerId')
  if (!ownerId) {
    const anonymousLimit = ANONYMOUS_PUBLIC_RPM
    const limiter = getRequestLimiter(anonymousLimit)

    try {
      const rateLimitRes = await limiter.consume(`anon:${clientIp}`, cost)
      c.header('X-RateLimit-Limit', String(anonymousLimit))
      c.header('X-RateLimit-Remaining', String(Math.max(0, rateLimitRes.remainingPoints)))
      c.header(
        'X-RateLimit-Reset',
        String(Math.ceil(Date.now() / 1000 + rateLimitRes.msBeforeNext / 1000))
      )
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(err.msBeforeNext / 1000)
        c.header('X-RateLimit-Limit', String(anonymousLimit))
        c.header('X-RateLimit-Remaining', '0')
        c.header('Retry-After', String(retryAfter))

        return c.json(
          {
            error: {
              code: 'RATE_LIMITED',
              message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
            },
          },
          429
        )
      }
    }

    await next()
    return
  }

  const planLimits = await getAccountPlanLimits(ownerId)
  const requestsPerMinute = normalizeRequestsPerMinute(planLimits.requestsPerMinute)

  if (requestsPerMinute === Infinity) {
    c.header('X-RateLimit-Limit', 'unlimited')
    c.header('X-RateLimit-Remaining', 'unlimited')
  } else {
    const limiter = getRequestLimiter(requestsPerMinute)
    try {
      const rateLimitRes = await limiter.consume(ownerId, cost)

      c.header('X-RateLimit-Limit', String(requestsPerMinute))
      c.header('X-RateLimit-Remaining', String(Math.max(0, rateLimitRes.remainingPoints)))
      c.header(
        'X-RateLimit-Reset',
        String(Math.ceil(Date.now() / 1000 + rateLimitRes.msBeforeNext / 1000))
      )
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        try {
          await blockLimiter.consume(clientIp)
        } catch {
          // The block limiter will reject subsequent requests.
        }

        const retryAfter = Math.ceil(err.msBeforeNext / 1000)
        c.header('X-RateLimit-Limit', String(requestsPerMinute))
        c.header('X-RateLimit-Remaining', '0')
        c.header('Retry-After', String(retryAfter))

        return c.json(
          {
            error: {
              code: 'RATE_LIMITED',
              message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
            },
          },
          429
        )
      }
    }
  }

  const quota = await reserveMonthlyQuota({
    ownerId,
    cost,
    monthlyLimit: planLimits.monthlyUnits,
  })
  setQuotaHeaders(c, quota)

  if (!quota.allowed) {
    return c.json(
      {
        error: {
          code: 'QUOTA_EXCEEDED',
          message: 'Monthly quota exceeded. Please upgrade your plan.',
          details: {
            used: quota.used,
            projected: quota.projected,
            limit: quota.limit,
          },
        },
      },
      429
    )
  }

  let successful = false
  try {
    await next()
    successful = c.res.status >= 200 && c.res.status < 400
  } finally {
    const billable =
      c.get('billableUsage') !== false && (successful || c.get('chargeUsageOnFailure') === true)
    const finalCost = billable ? Math.max(0, Math.min(cost, c.get('requestCost') ?? cost)) : 0
    await releaseMonthlyQuota(quota.reservationKey, cost - finalCost)
  }
})

export const consumeDashboardRateLimit = (accountId: string) =>
  consumeOperationalLimiters([[dashboardLimiter, accountId]])

export const consumePreflightRateLimit = (identity: string) =>
  consumeOperationalLimiters([[preflightLimiter, identity]])

export const consumeAvatarRateLimit = (userId: string, clientIp: string) =>
  consumeOperationalLimiters([
    [avatarUserLimiter, userId],
    [avatarIpLimiter, clientIp],
  ])

export const consumeNotificationTestRateLimit = (accountId: string, channelId: string) =>
  consumeOperationalLimiters([
    [notificationChannelLimiter, channelId],
    [notificationAccountLimiter, accountId],
  ])

export const consumeSpriteUploadRateLimit = (accountId: string) =>
  consumeOperationalLimiters([[spriteUploadLimiter, accountId]])

export const consumeSpritePublicationRateLimit = (accountId: string) =>
  consumeOperationalLimiters([[spritePublicationLimiter, accountId]])

async function consumeOperationalLimiters(
  entries: Array<[RateLimiterRedis, string]>
): Promise<number | null> {
  try {
    await Promise.all(entries.map(([limiter, key]) => limiter.consume(key)))
    return null
  } catch (error) {
    return error instanceof RateLimiterRes
      ? Math.max(1, Math.ceil(error.msBeforeNext / 1000))
      : null
  }
}

async function getRequestCost(c: Context<AuthEnv>) {
  const baseCost = getEndpointCost(c.req.path)
  if (c.req.method !== 'POST') {
    return baseCost
  }

  try {
    return getPostEndpointCost(c.req.path, await c.req.raw.clone().json())
  } catch {
    return baseCost
  }
}
