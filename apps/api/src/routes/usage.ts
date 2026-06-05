import { Hono } from "hono";
import { eq, and, gte, lte, sql, desc, count, isNull } from "drizzle-orm";
import { db, usageLogs, apiKeys } from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";
import {
  getAccountPlan,
  getAccountPlanLimits,
  PLANS,
  serializePlanLimits,
} from "../lib/billing";
import { getMonthlyUsagePeriod } from "../lib/usage-quota";

export const usageRoute = new Hono<AuthEnv>();

// ── GET /console/usage/summary — Aggregated usage stats ─────────────────────

usageRoute.get("/usage/summary", async (c) => {
  const ownerId = c.get("ownerId");
  const [plan, limits] = await Promise.all([
    getAccountPlan(ownerId),
    getAccountPlanLimits(ownerId),
  ]);
  const period = getMonthlyUsagePeriod();
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
      avgResponseTime: sql<number>`0`.as("avg_response_time"), // placeholder
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, startOfMonth)
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
        gte(usageLogs.timestamp, startOfLastMonth),
        lte(usageLogs.timestamp, startOfMonth)
      )
    );

  // Active API keys count
  const [keysCount] = await db
    .select({ count: count() })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.ownerId, ownerId),
        isNull(apiKeys.deletedAt)
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
    },
  });
});

// ── GET /console/usage/timeseries — Usage over time ─────────────────────────

usageRoute.get("/usage/timeseries", async (c) => {
  const ownerId = c.get("ownerId");
  const days = Number(c.req.query("days")) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

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
        gte(usageLogs.timestamp, startDate)
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
});

// ── GET /console/usage/by-key — Usage by API key ────────────────────────────

usageRoute.get("/usage/by-key", async (c) => {
  const ownerId = c.get("ownerId");
  const days = Number(c.req.query("days")) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

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
        gte(usageLogs.timestamp, startDate)
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
});

// ── GET /console/usage/by-endpoint — Usage by endpoint ──────────────────────

usageRoute.get("/usage/by-endpoint", async (c) => {
  const ownerId = c.get("ownerId");
  const days = Number(c.req.query("days")) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

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
        gte(usageLogs.timestamp, startDate)
      )
    )
    .groupBy(usageLogs.endpoint, usageLogs.method)
    .orderBy(desc(sql`count(*)`));

  return c.json({ data: rows });
});

// ── GET /console/usage/logs — Raw usage logs ────────────────────────────────

usageRoute.get("/usage/logs", async (c) => {
  const ownerId = c.get("ownerId");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 50));
  const offset = (page - 1) * limit;

  const [totalRow] = await db
    .select({ total: count() })
    .from(usageLogs)
    .where(eq(usageLogs.profileId, ownerId));

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
    .where(eq(usageLogs.profileId, ownerId))
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
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

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
