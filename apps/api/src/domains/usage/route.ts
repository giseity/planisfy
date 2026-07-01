import { Hono, type Context } from "hono";
import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";
import { db, usageLogs, apiKeys } from "@planisfy/database";
import {
  usageDaysQuerySchema,
  usageLogsQuerySchema,
} from "@planisfy/api-contracts";
import type { AuthEnv } from "../../middleware/auth";
import { env } from "../../env";
import {
  getAccountPlan,
  getAccountPlanLimits,
  PLANS,
  serializePlanLimits,
} from "../billing/billing";
import { getMonthlyUsagePeriod } from "./usage-quota";
import { queryValidator } from "../../shared/validation/validation";

export const usageRoute = new Hono<AuthEnv>();
export const USAGE_LOG_RETENTION_DAYS = 90;

// ── GET /console/usage/summary — Aggregated usage stats ─────────────────────

usageRoute.get("/usage/summary", async (c) => {
  const ownerId = c.get("ownerId");
  const [plan, limits] = await Promise.all([
    getAccountPlan(ownerId),
    getAccountPlanLimits(ownerId),
  ]);
  const period = getMonthlyUsagePeriod();
  const retention = usageRetentionWindow();
  const startOfMonth = period.start;
  const startOfLastMonth = new Date(
    Date.UTC(
      startOfMonth.getUTCFullYear(),
      startOfMonth.getUTCMonth() - 1,
      1,
    ),
  );

  // This month's usage
  const [currentMonth] = await db
    .select({
      totalRequests: count(),
      totalUnits: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("total_units"),
      avgResponseTime: sql<number>`coalesce(round(avg(${usageLogs.durationMs})), 0)::integer`.as("avg_response_time"),
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, laterDate(startOfMonth, retention.oldestAt))
      )
    );

  // Last month's usage (for comparison)
  const [lastMonth] = await db
    .select({
      totalRequests: count(),
      totalUnits: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("total_units"),
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(
          usageLogs.timestamp,
          laterDate(startOfLastMonth, retention.oldestAt),
        ),
        lte(usageLogs.timestamp, startOfMonth)
      )
    );

  // Active API keys count
  const [keysCount] = await db
    .select({ count: count() })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.referenceId, ownerId),
        eq(apiKeys.enabled, true)
      )
    );

  const totalUnits = Number(currentMonth?.totalUnits ?? 0);
  const serializedLimits = serializePlanLimits(limits);
  const quotaPercent =
    limits.monthlyUnits === Infinity
      ? 0
      : Math.min(100, Math.round((totalUnits / limits.monthlyUnits) * 100));

  return c.json({
    data: {
      totalRequests: currentMonth?.totalRequests ?? 0,
      totalUnits,
      activeApiKeys: keysCount?.count ?? 0,
      deploymentMode: env.DEPLOYMENT_MODE,
      plan: {
        id: plan,
        name: PLANS[plan]?.name ?? PLANS.free.name,
        limits: serializedLimits,
      },
      quota: {
        used: totalUnits,
        limit: serializedLimits.monthlyUnits,
        remaining:
          limits.monthlyUnits === Infinity
            ? null
            : Math.max(0, limits.monthlyUnits - totalUnits),
        percent: quotaPercent,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      },
      previousPeriod: {
        totalRequests: lastMonth?.totalRequests ?? 0,
        totalUnits: Number(lastMonth?.totalUnits ?? 0),
      },
      retention: serializeUsageRetention(retention),
    },
  });
});

// ── GET /console/usage/timeseries — Usage over time ─────────────────────────

usageRoute.get(
  "/usage/timeseries",
  queryValidator(usageDaysQuerySchema),
  async (c) => {
  const ownerId = c.get("ownerId");
  const { days } = c.req.valid("query");
  const retention = usageRetentionWindow();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const effectiveStartDate = laterDate(startDate, retention.oldestAt);

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${usageLogs.timestamp})::date`.as("date"),
      endpoint: usageLogs.endpoint,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, effectiveStartDate)
      )
    )
    .groupBy(
      sql`date_trunc('day', ${usageLogs.timestamp})::date`,
      usageLogs.endpoint
    )
    .orderBy(sql`date_trunc('day', ${usageLogs.timestamp})::date`);

  // Group by date, categorize endpoints
  const byDate = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const dateStr = String(row.date);
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, { tiles: 0, styles: 0, geocoding: 0, directions: 0, elevation: 0, static: 0, other: 0 });
    }
    const bucket = byDate.get(dateStr)!;
    const category = categorizeEndpoint(row.endpoint);
    bucket[category] = (bucket[category] || 0) + row.requests;
  }

  return c.json({
    data: Array.from(byDate.entries()).map(([date, services]) => ({
      date,
      ...services,
      total: Object.values(services).reduce((a, b) => a + b, 0),
    })),
  });
  },
);

// ── GET /console/usage/by-key — Usage by API key ────────────────────────────

usageRoute.get(
  "/usage/by-key",
  queryValidator(usageDaysQuerySchema),
  async (c) => {
  const ownerId = c.get("ownerId");
  const { days } = c.req.valid("query");
  const retention = usageRetentionWindow();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const effectiveStartDate = laterDate(startDate, retention.oldestAt);

  const rows = await db
    .select({
      apiKeyId: usageLogs.apiKeyId,
      keyName: apiKeys.name,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
    })
    .from(usageLogs)
    .leftJoin(apiKeys, eq(usageLogs.apiKeyId, apiKeys.id))
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, effectiveStartDate)
      )
    )
    .groupBy(usageLogs.apiKeyId, apiKeys.name)
    .orderBy(desc(sql`count(*)`));

  return c.json({
    data: rows.map((row) => ({
      apiKeyId: row.apiKeyId,
      name: row.keyName || "Session (Console)",
      requests: row.requests,
      units: Number(row.units),
    })),
  });
  },
);

// ── GET /console/usage/by-endpoint — Usage by endpoint ──────────────────────

usageRoute.get(
  "/usage/by-endpoint",
  queryValidator(usageDaysQuerySchema),
  async (c) => {
  const ownerId = c.get("ownerId");
  const { days } = c.req.valid("query");
  const retention = usageRetentionWindow();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const effectiveStartDate = laterDate(startDate, retention.oldestAt);

  const rows = await db
    .select({
      endpoint: usageLogs.endpoint,
      method: usageLogs.method,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
      successCount: sql<number>`count(*) filter (where ${usageLogs.statusCode} < 400)`.as("success_count"),
      errorCount: sql<number>`count(*) filter (where ${usageLogs.statusCode} >= 400)`.as("error_count"),
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, effectiveStartDate)
      )
    )
    .groupBy(usageLogs.endpoint, usageLogs.method)
    .orderBy(desc(sql`count(*)`));

  return c.json({ data: rows });
  },
);

// ── GET /console/usage/logs — Raw usage logs ────────────────────────────────

usageRoute.get(
  "/usage/logs",
  queryValidator(usageLogsQuerySchema),
  async (c) => {
  const ownerId = c.get("ownerId");
  const { page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;
  const retention = usageRetentionWindow();
  if (offset > 10_000) {
    return usageValidationError(c, "Requested usage log offset is too large");
  }

  const [totalRow] = await db
    .select({ total: count() })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, retention.oldestAt),
      ),
    );

  const total = totalRow?.total ?? 0;

  const rows = await db
    .select({
      id: usageLogs.id,
      apiKeyId: usageLogs.apiKeyId,
      endpoint: usageLogs.endpoint,
      method: usageLogs.method,
      statusCode: usageLogs.statusCode,
      cost: usageLogs.cost,
      ipAddress: usageLogs.ipAddress,
      timestamp: usageLogs.timestamp,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, retention.oldestAt),
      ),
    )
    .orderBy(desc(usageLogs.timestamp))
    .limit(limit)
    .offset(offset);

  return c.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    retention: serializeUsageRetention(retention),
  });
  },
);

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseBoundedIntegerParam(
  value: string | undefined,
  name: string,
  options: { defaultValue: number; min: number; max: number },
):
  | { ok: true; value: number }
  | { ok: false; message: string } {
  if (value === undefined || value === "") {
    return { ok: true, value: options.defaultValue };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, message: `${name} must be an integer` };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, message: `${name} is too large` };
  }
  if (parsed < options.min || parsed > options.max) {
    return {
      ok: false,
      message: `${name} must be between ${options.min} and ${options.max}`,
    };
  }
  return { ok: true, value: parsed };
}

export function usageRetentionWindow(now = new Date()) {
  const oldestAt = new Date(now);
  oldestAt.setUTCDate(oldestAt.getUTCDate() - USAGE_LOG_RETENTION_DAYS + 1);
  oldestAt.setUTCHours(0, 0, 0, 0);
  return {
    days: USAGE_LOG_RETENTION_DAYS,
    oldestAt,
    newestAt: now,
  };
}

export function usageDaysLimit() {
  return {
    defaultValue: Math.min(30, USAGE_LOG_RETENTION_DAYS),
    min: 1,
    max: USAGE_LOG_RETENTION_DAYS,
  };
}

function serializeUsageRetention(
  retention: ReturnType<typeof usageRetentionWindow>,
) {
  return {
    days: retention.days,
    oldestAt: retention.oldestAt.toISOString(),
    newestAt: retention.newestAt.toISOString(),
  };
}

function laterDate(left: Date, right: Date) {
  return left > right ? left : right;
}

function usageValidationError(c: Context<AuthEnv>, message: string) {
  return c.json(
    { error: { code: "VALIDATION_ERROR", message } },
    400,
  );
}

function categorizeEndpoint(endpoint: string): string {
  if (endpoint.startsWith("/tiles")) return "tiles";
  if (endpoint.startsWith("/styles")) return "styles";
  if (endpoint.startsWith("/fonts")) return "tiles"; // fonts are part of tile serving
  if (endpoint.startsWith("/geocoding")) return "geocoding";
  if (endpoint.startsWith("/directions") || endpoint.startsWith("/isochrone") || endpoint.startsWith("/matching") || endpoint.startsWith("/matrix") || endpoint.startsWith("/optimized")) return "directions";
  if (endpoint.startsWith("/elevation")) return "elevation";
  if (endpoint.startsWith("/static")) return "static";
  return "other";
}
