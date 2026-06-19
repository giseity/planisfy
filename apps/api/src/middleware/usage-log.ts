import { createMiddleware } from "hono/factory";
import { enqueueUsageLog } from "../domains/usage/usage-queue";
import { getEndpointCost } from "../domains/keys/api-key";
import type { AuthEnv } from "./auth";

/**
 * Usage logging middleware for public API endpoints.
 * Enqueues a usage log entry after the response is sent.
 * Non-blocking — never affects request latency.
 */
export const usageLogMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const startedAt = performance.now();
  let statusCode = 500;

  try {
    await next();
    statusCode = c.res.status;
  } finally {
    const apiKeyId = c.get("apiKeyId") ?? null;
    const ownerId = c.get("ownerId") ?? null;
    const cost = getEndpointCost(c.req.path);

    enqueueUsageLog({
      apiKeyId,
      profileId: ownerId,
      endpoint: c.req.path,
      method: c.req.method,
      statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      cost,
      ipAddress:
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        c.req.header("x-real-ip") ||
        null,
      referer: c.req.header("referer") || null,
      userAgent: c.req.header("user-agent") || null,
    });
  }
});
