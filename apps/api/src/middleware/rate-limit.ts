import { createMiddleware } from "hono/factory";
import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterRes,
} from "rate-limiter-flexible";
import Redis from "ioredis";
import { PLAN_LIMITS, type PlanId } from "@planisfy/types";
import { getEndpointCost } from "../lib/api-key";
import { getUserPlan } from "../lib/billing";
import { redisConnection } from "../env";
import type { AuthEnv } from "./auth";

// ── Redis client ────────────────────────────────────────────────────────────

const redis = new Redis({
  ...redisConnection,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

redis.connect().catch((err) => {
  console.warn("[rate-limit] Redis connection failed, using memory fallback:", err.message);
});

// ── Per-plan rate limiters (requests per minute) ────────────────────────────

const memoryFallback = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

const planLimiters = {} as Record<PlanId, RateLimiterRedis>;

for (const [planId, limits] of Object.entries(PLAN_LIMITS)) {
  planLimiters[planId as PlanId] = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${planId}`,
    points: limits.requestsPerMinute,
    duration: 60, // per minute
    insuranceLimiter: memoryFallback,
  });
}

// ── DDoS blocker: in-memory block list for repeat offenders ─────────────────

const blockLimiter = new RateLimiterMemory({
  points: 10, // 10 rate-limit violations...
  duration: 300, // ...within 5 minutes → block
  blockDuration: 600, // blocked for 10 minutes
});

// ── Monthly quota tracking via Redis ────────────────────────────────────────

function getMonthlyQuotaKey(ownerId: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `quota:${ownerId}:${month}`;
}

async function checkAndIncrementQuota(
  ownerId: string,
  cost: number,
  monthlyLimit: number
): Promise<{ allowed: boolean; used: number; limit: number }> {
  if (monthlyLimit === Infinity) {
    return { allowed: true, used: 0, limit: monthlyLimit };
  }

  try {
    const key = getMonthlyQuotaKey(ownerId);
    const newTotal = await redis.incrby(key, cost);

    // Set TTL on first increment (35 days for cleanup)
    if (newTotal === cost) {
      await redis.expire(key, 35 * 24 * 60 * 60);
    }

    return {
      allowed: newTotal <= monthlyLimit,
      used: newTotal,
      limit: monthlyLimit,
    };
  } catch {
    // If Redis is down, allow the request (fail open for quota)
    return { allowed: true, used: 0, limit: monthlyLimit };
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Rate limiting middleware for public API endpoints.
 * Uses the ownerId (from API key or session) as the rate limit key.
 *
 * Flow:
 * 1. Check DDoS block list
 * 2. Check per-minute rate limit (plan-based)
 * 3. Check monthly quota (Redis counter)
 * 4. Set rate limit headers on response
 */
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

  // 1. Check DDoS block list (by IP)
  try {
    await blockLimiter.consume(clientIp, 0); // 0 = just check, don't consume
  } catch {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
      429
    );
  }

  // 2. Determine the user's plan
  const userId = c.get("userId");
  const rawPlan = userId ? await getUserPlan(userId) : "free";
  const planId: PlanId = `prod_${rawPlan}` as PlanId;
  const planLimits = PLAN_LIMITS[planId] || PLAN_LIMITS.prod_free;
  const limiter = planLimiters[planId];
  const cost = getEndpointCost(c.req.path);

  // 3. Per-minute rate limit
  try {
    const rateLimitRes = await limiter.consume(ownerId, cost);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(planLimits.requestsPerMinute));
    c.header("X-RateLimit-Remaining", String(Math.max(0, rateLimitRes.remainingPoints)));
    c.header(
      "X-RateLimit-Reset",
      String(Math.ceil(Date.now() / 1000 + rateLimitRes.msBeforeNext / 1000))
    );
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      // Rate limited — record violation for DDoS detection
      try {
        await blockLimiter.consume(clientIp);
      } catch {
        // Now blocked
      }

      const retryAfter = Math.ceil(err.msBeforeNext / 1000);
      c.header("X-RateLimit-Limit", String(planLimits.requestsPerMinute));
      c.header("X-RateLimit-Remaining", "0");
      c.header("Retry-After", String(retryAfter));

      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
          },
        },
        429
      );
    }
    // Unknown error — fail open
  }

  // 4. Monthly quota check
  const quota = await checkAndIncrementQuota(ownerId, cost, planLimits.monthlyUnits);
  if (!quota.allowed) {
    return c.json(
      {
        error: {
          code: "QUOTA_EXCEEDED",
          message: "Monthly quota exceeded. Please upgrade your plan.",
          details: { used: quota.used, limit: quota.limit },
        },
      },
      429
    );
  }

  await next();
});
