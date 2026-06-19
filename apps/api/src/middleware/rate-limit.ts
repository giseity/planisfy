import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";
import Redis from "ioredis";
import { getEndpointCost } from "../domains/keys/api-key";
import { getAccountPlanLimits } from "../domains/billing/billing";
import { normalizeRequestsPerMinute } from "../shared/policy/rate-limit-policy";
import {
  checkMonthlyUsageQuota,
  evaluateMonthlyQuota,
  getMonthlyUsagePeriod,
  getMonthlyUsageUnits,
  type QuotaEvaluation,
} from "../domains/usage/usage-quota";
import { redisConnection } from "../env";
import type { AuthEnv } from "./auth";

const MONTHLY_QUOTA_CACHE_TTL_SECONDS = 35 * 24 * 60 * 60;
const ANONYMOUS_PUBLIC_RPM = 120;
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
`;

const redis = new Redis({
  ...redisConnection,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

redis.connect().catch((err) => {
  console.warn(
    "[rate-limit] Redis connection failed, using memory fallback:",
    err.message,
  );
});

const requestLimiters = new Map<number, RateLimiterRedis>();

const blockLimiter = new RateLimiterMemory({
  points: 10,
  duration: 300,
  blockDuration: 600,
});

function getMonthlyQuotaKey(ownerId: string, periodKey: string): string {
  return `quota:${ownerId}:${periodKey}`;
}

function setQuotaHeaders(c: Context<AuthEnv>, quota: QuotaEvaluation) {
  c.header(
    "X-Quota-Limit",
    quota.limit === Infinity ? "unlimited" : String(quota.limit),
  );
  c.header("X-Quota-Used", String(quota.projected));
  c.header(
    "X-Quota-Remaining",
    quota.remaining === Infinity ? "unlimited" : String(quota.remaining),
  );
}

function getRequestLimiter(requestsPerMinute: number) {
  const points = normalizeRequestsPerMinute(requestsPerMinute);
  const existing = requestLimiters.get(points);
  if (existing) return existing;

  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${points}rpm`,
    points,
    duration: 60,
    insuranceLimiter: new RateLimiterMemory({
      points,
      duration: 60,
    }),
  });
  requestLimiters.set(points, limiter);
  return limiter;
}

async function reserveMonthlyQuota(params: {
  ownerId: string;
  cost: number;
  monthlyLimit: number;
}): Promise<QuotaEvaluation> {
  if (params.monthlyLimit === Infinity) {
    return evaluateMonthlyQuota({
      used: 0,
      cost: params.cost,
      limit: params.monthlyLimit,
    });
  }

  const period = getMonthlyUsagePeriod();
  const durableUsed = await getMonthlyUsageUnits(params.ownerId, period.start);

  try {
    const key = getMonthlyQuotaKey(params.ownerId, period.key);
    const reservation = await redis.eval(
      QUOTA_RESERVATION_SCRIPT,
      1,
      key,
      String(durableUsed),
      String(params.cost),
      String(params.monthlyLimit),
      String(MONTHLY_QUOTA_CACHE_TTL_SECONDS),
    );
    const [allowedRaw, usedRaw] = parseQuotaReservation(reservation);
    const usedBeforeRequest = usedRaw;
    const quota = evaluateMonthlyQuota({
      used: usedBeforeRequest,
      cost: params.cost,
      limit: params.monthlyLimit,
    });

    return { ...quota, allowed: allowedRaw === 1 && quota.allowed };
  } catch {
    return checkMonthlyUsageQuota({
      ownerId: params.ownerId,
      cost: params.cost,
      limit: params.monthlyLimit,
    });
  }
}

export function parseQuotaReservation(result: unknown): [number, number] {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Invalid quota reservation result");
  }
  const allowed = Number(result[0]);
  const used = Number(result[1]);
  if (!Number.isFinite(allowed) || !Number.isFinite(used)) {
    throw new Error("Invalid quota reservation result");
  }
  return [allowed, used];
}

export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const clientIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  try {
    await blockLimiter.consume(clientIp, 0);
  } catch {
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
      },
      429,
    );
  }

  const ownerId = c.get("ownerId");
  if (!ownerId) {
    const cost = getEndpointCost(c.req.path);
    const anonymousLimit = ANONYMOUS_PUBLIC_RPM;
    const limiter = getRequestLimiter(anonymousLimit);

    try {
      const rateLimitRes = await limiter.consume(`anon:${clientIp}`, cost);
      c.header("X-RateLimit-Limit", String(anonymousLimit));
      c.header(
        "X-RateLimit-Remaining",
        String(Math.max(0, rateLimitRes.remainingPoints)),
      );
      c.header(
        "X-RateLimit-Reset",
        String(
          Math.ceil(Date.now() / 1000 + rateLimitRes.msBeforeNext / 1000),
        ),
      );
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(err.msBeforeNext / 1000);
        c.header("X-RateLimit-Limit", String(anonymousLimit));
        c.header("X-RateLimit-Remaining", "0");
        c.header("Retry-After", String(retryAfter));

        return c.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
            },
          },
          429,
        );
      }
    }

    await next();
    return;
  }

  const planLimits = await getAccountPlanLimits(ownerId);
  const requestsPerMinute = normalizeRequestsPerMinute(
    planLimits.requestsPerMinute,
  );
  const cost = getEndpointCost(c.req.path);

  if (requestsPerMinute === Infinity) {
    c.header("X-RateLimit-Limit", "unlimited");
    c.header("X-RateLimit-Remaining", "unlimited");
  } else {
    const limiter = getRequestLimiter(requestsPerMinute);
    try {
      const rateLimitRes = await limiter.consume(ownerId, cost);

      c.header("X-RateLimit-Limit", String(requestsPerMinute));
      c.header(
        "X-RateLimit-Remaining",
        String(Math.max(0, rateLimitRes.remainingPoints)),
      );
      c.header(
        "X-RateLimit-Reset",
        String(
          Math.ceil(Date.now() / 1000 + rateLimitRes.msBeforeNext / 1000),
        ),
      );
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        try {
          await blockLimiter.consume(clientIp);
        } catch {
          // The block limiter will reject subsequent requests.
        }

        const retryAfter = Math.ceil(err.msBeforeNext / 1000);
        c.header("X-RateLimit-Limit", String(requestsPerMinute));
        c.header("X-RateLimit-Remaining", "0");
        c.header("Retry-After", String(retryAfter));

        return c.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
            },
          },
          429,
        );
      }
    }
  }

  const quota = await reserveMonthlyQuota({
    ownerId,
    cost,
    monthlyLimit: planLimits.monthlyUnits,
  });
  setQuotaHeaders(c, quota);

  if (!quota.allowed) {
    return c.json(
      {
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Monthly quota exceeded. Please upgrade your plan.",
          details: {
            used: quota.used,
            projected: quota.projected,
            limit: quota.limit,
          },
        },
      },
      429,
    );
  }

  await next();
});
