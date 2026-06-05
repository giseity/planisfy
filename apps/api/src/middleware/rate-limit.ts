import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";
import Redis from "ioredis";
import { PLANS, type PlanSlug } from "@planisfy/types";
import { getEndpointCost } from "../lib/api-key";
import { getUserPlan } from "../lib/billing";
import {
  checkMonthlyUsageQuota,
  evaluateMonthlyQuota,
  getMonthlyUsagePeriod,
  getMonthlyUsageUnits,
  type QuotaEvaluation,
} from "../lib/usage-quota";
import { redisConnection } from "../env";
import type { AuthEnv } from "./auth";

const MONTHLY_QUOTA_CACHE_TTL_SECONDS = 35 * 24 * 60 * 60;

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

const memoryFallback = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

const planSlugs = Object.keys(PLANS) as PlanSlug[];
const planLimiters = Object.fromEntries(
  planSlugs.map((planId) => [
    planId,
    new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `rl:${planId}`,
      points: PLANS[planId].requestsPerMinute,
      duration: 60,
      insuranceLimiter: memoryFallback,
    }),
  ]),
) as Record<PlanSlug, RateLimiterRedis>;

const blockLimiter = new RateLimiterMemory({
  points: 10,
  duration: 300,
  blockDuration: 600,
});

function getMonthlyQuotaKey(ownerId: string, periodKey: string): string {
  return `quota:${ownerId}:${periodKey}`;
}

function setQuotaHeaders(c: Context<AuthEnv>, quota: QuotaEvaluation) {
  c.header("X-Quota-Limit", quota.limit === Infinity ? "unlimited" : String(quota.limit));
  c.header("X-Quota-Used", String(quota.projected));
  c.header(
    "X-Quota-Remaining",
    quota.remaining === Infinity ? "unlimited" : String(quota.remaining),
  );
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
    const cachedRaw = await redis.get(key);
    const cachedUsed = cachedRaw ? Number(cachedRaw) : 0;
    const baseline = Math.max(
      Number.isFinite(cachedUsed) ? cachedUsed : 0,
      durableUsed,
    );

    await redis.set(
      key,
      String(baseline),
      "EX",
      MONTHLY_QUOTA_CACHE_TTL_SECONDS,
    );

    const projected = await redis.incrby(key, params.cost);
    const usedBeforeRequest = projected - params.cost;
    const quota = evaluateMonthlyQuota({
      used: usedBeforeRequest,
      cost: params.cost,
      limit: params.monthlyLimit,
    });

    if (!quota.allowed) {
      await redis.decrby(key, params.cost);
    }

    return quota;
  } catch {
    return checkMonthlyUsageQuota({
      ownerId: params.ownerId,
      cost: params.cost,
      limit: params.monthlyLimit,
    });
  }
}

export const rateLimitMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const ownerId = c.get("ownerId");
  if (!ownerId) {
    await next();
    return;
  }

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

  const userId = c.get("userId");
  const planId = userId ? await getUserPlan(userId) : "free";
  const plan = PLANS[planId] ?? PLANS.free;
  const limiter = planLimiters[planId] ?? planLimiters.free;
  const cost = getEndpointCost(c.req.path);

  try {
    const rateLimitRes = await limiter.consume(ownerId, cost);

    c.header("X-RateLimit-Limit", String(plan.requestsPerMinute));
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
      c.header("X-RateLimit-Limit", String(plan.requestsPerMinute));
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

  const quota = await reserveMonthlyQuota({
    ownerId,
    cost,
    monthlyLimit: plan.monthlyUnits,
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
