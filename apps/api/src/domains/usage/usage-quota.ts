import { db, usageLogs } from "@planisfy/database";
import { and, eq, gte, sql } from "drizzle-orm";

export interface MonthlyUsagePeriod {
  start: Date;
  end: Date;
  key: string;
}

export interface QuotaEvaluation {
  allowed: boolean;
  used: number;
  projected: number;
  limit: number;
  remaining: number;
  percent: number;
}

export function getMonthlyUsagePeriod(now = new Date()): MonthlyUsagePeriod {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const key = `${start.getUTCFullYear()}-${String(
    start.getUTCMonth() + 1,
  ).padStart(2, "0")}`;

  return { start, end, key };
}

export async function getMonthlyUsageUnits(
  ownerId: string,
  periodStart = getMonthlyUsagePeriod().start,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("total"),
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.profileId, ownerId),
        gte(usageLogs.timestamp, periodStart),
      ),
    );

  return Number(row?.total ?? 0);
}

export function evaluateMonthlyQuota(params: {
  used: number;
  cost: number;
  limit: number;
}): QuotaEvaluation {
  const used = Math.max(0, params.used);
  const cost = Math.max(0, params.cost);
  const limit = params.limit;

  if (limit === Infinity) {
    return {
      allowed: true,
      used,
      projected: used + cost,
      limit,
      remaining: Infinity,
      percent: 0,
    };
  }

  const projected = used + cost;
  const remaining = Math.max(0, limit - projected);

  return {
    allowed: projected <= limit,
    used,
    projected,
    limit,
    remaining,
    percent: Math.min(100, Math.round((projected / limit) * 100)),
  };
}

export async function checkMonthlyUsageQuota(params: {
  ownerId: string;
  cost: number;
  limit: number;
  now?: Date;
}): Promise<QuotaEvaluation> {
  const period = getMonthlyUsagePeriod(params.now);
  const used = await getMonthlyUsageUnits(params.ownerId, period.start);
  return evaluateMonthlyQuota({
    used,
    cost: params.cost,
    limit: params.limit,
  });
}
