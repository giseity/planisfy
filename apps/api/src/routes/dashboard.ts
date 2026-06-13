import { Hono } from "hono";
import Redis from "ioredis";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  apiKeys,
  auditEvents,
  db,
  processingJobs,
  accounts,
  styles,
  tilesetVersions,
  tilesets,
  usageLogs,
  users,
} from "@planisfy/database";
import {
  WORKER_GEODATA_HEARTBEAT_KEY,
  WORKER_GEODATA_HEARTBEAT_STALE_MS,
} from "@planisfy/geodata-contracts";
import { getStorage } from "@planisfy/storage";
import {
  buildDashboardPayload,
  categorizeDashboardEndpoint,
  emptyTimeseries,
  makeHealthEntry,
  normalizeHealthStatus,
  type DashboardEndpointBreakdown,
  type DashboardHealthEntry,
  type DashboardRecentJob,
  type DashboardRecentStyle,
  type DashboardRecentTileset,
  type DashboardRecentTilesetVersion,
  type DashboardTimeseriesPoint,
  type DashboardTopApiKey,
} from "../lib/dashboard";
import {
  getAccountPlan,
  getAccountPlanLimits,
  isBillingConfigured,
  serializePlanLimits,
} from "../lib/billing";
import { getMonthlyUsagePeriod } from "../lib/usage-quota";
import { isPeliasConfigured } from "../lib/geocoding-config";
import { probeValhallaReadiness } from "../lib/valhalla-readiness";
import type { AuthEnv } from "../middleware/auth";
import { env, redisConnection } from "../env";

export const dashboardRoute = new Hono<AuthEnv>();

dashboardRoute.get("/dashboard", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const now = new Date();
  const period = getMonthlyUsagePeriod(now);
  const usageStart = new Date(now);
  usageStart.setUTCDate(usageStart.getUTCDate() - 29);
  usageStart.setUTCHours(0, 0, 0, 0);

  const [account] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
      avatarUrl: accounts.avatarUrl,
      type: accounts.type,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
    .limit(1);

  if (!account) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Account not found" } },
      404,
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const plan = await getAccountPlan(accountId);
  const quotaLimit = serializePlanLimits(
    await getAccountPlanLimits(accountId),
  ).monthlyUnits;

  const [
    styleRows,
    apiKeyRows,
    tilesetRows,
    jobRows,
    auditRows,
    monthlyUsage,
    usageRows,
    endpointRows,
    topKeyRows,
  ] = await Promise.all([
    fetchStyles(accountId, account.handle),
    fetchApiKeys(accountId),
    fetchTilesets(accountId, account.handle),
    fetchJobs(accountId),
    fetchAudit(accountId),
    fetchMonthlyUsage(accountId, period.start),
    fetchUsageRows(accountId, usageStart),
    fetchEndpointBreakdown(accountId, usageStart),
    fetchTopApiKeys(accountId, usageStart),
  ]);

  const health = await fetchDashboardHealth(now);
  const runningJobs = jobRows.filter((job) =>
    ["PENDING", "PROCESSING"].includes(job.status),
  ).length;
  const failedJobs = jobRows.filter((job) => job.status === "FAILED").length;
  const publishedTilesets = tilesetRows.filter((tileset) => tileset.isPublished)
    .length;
  const timeseries = buildTimeseries(usageRows, usageStart, now);

  return c.json({
    data: buildDashboardPayload({
      generatedAt: now,
      account: {
        id: account.id,
        handle: account.handle,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        type: account.type,
      },
      user: {
        id: userId,
        email: user?.email ?? null,
        emailVerified: user?.emailVerified ?? false,
      },
      plan,
      monthlyQuotaUsed: monthlyUsage.units,
      monthlyQuotaLimit: quotaLimit,
      totalRequests: monthlyUsage.requests,
      errorCount: monthlyUsage.errors,
      counts: {
        activeApiKeys: apiKeyRows.length,
        totalStyles: styleRows.length,
        publishedStyles: styleRows.filter((style) => style.isPublic).length,
        totalTilesets: tilesetRows.length,
        publishedTilesets,
        runningJobs,
        failedJobs,
      },
      timeseries,
      endpointBreakdown: endpointRows,
      topApiKeys: topKeyRows,
      recentStyles: styleRows,
      recentTilesets: tilesetRows,
      recentJobs: jobRows,
      recentAudit: auditRows,
      health,
      apiBaseUrl: env.NEXT_PUBLIC_API_URL.replace(/\/$/, ""),
    }),
  });
});

async function fetchStyles(
  accountId: string,
  ownerHandle: string,
): Promise<DashboardRecentStyle[]> {
  const rows = await db
    .select({
      id: styles.id,
      handle: styles.handle,
      name: styles.name,
      description: styles.description,
      isPublic: styles.isPublic,
      thumbnailUrl: styles.thumbnailUrl,
      version: styles.version,
      createdAt: styles.createdAt,
      updatedAt: styles.updatedAt,
    })
    .from(styles)
    .where(and(eq(styles.ownerId, accountId), isNull(styles.deletedAt)))
    .orderBy(desc(styles.updatedAt))
    .limit(10);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publicUrl: row.isPublic ? `/styles/v1/${ownerHandle}/${row.handle}` : null,
  }));
}

async function fetchApiKeys(accountId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.ownerId, accountId), isNull(apiKeys.deletedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

async function fetchTilesets(
  accountId: string,
  ownerHandle: string | null,
): Promise<DashboardRecentTileset[]> {
  const rows = await db
    .select()
    .from(tilesets)
    .where(and(eq(tilesets.accountId, accountId), isNull(tilesets.deletedAt)))
    .orderBy(desc(tilesets.updatedAt))
    .limit(10);
  const versions =
    rows.length > 0
      ? await db
          .select()
          .from(tilesetVersions)
          .where(inArray(tilesetVersions.tilesetId, rows.map((row) => row.id)))
          .orderBy(desc(tilesetVersions.version))
      : [];

  return rows.map((row) => {
    const rowVersions = versions.filter((version) => version.tilesetId === row.id);
    const currentVersion =
      rowVersions.find((version) => version.id === row.currentVersionId) ?? null;
    const latestVersion = rowVersions[0] ?? null;
    return {
      id: row.id,
      handle: row.handle,
      name: row.name,
      description: row.description,
      status: row.status,
      type: row.type,
      isPublished: Boolean(currentVersion),
      ownerHandle,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      currentVersion: toDashboardTilesetVersion(currentVersion),
      latestVersion: toDashboardTilesetVersion(latestVersion),
      tilejsonUrl:
        ownerHandle && currentVersion
          ? `/tiles/v1/${ownerHandle}/${row.handle}.json`
          : null,
      versionedTilejsonUrl:
        ownerHandle && currentVersion
          ? `/tiles/v1/${ownerHandle}/${row.handle}/versions/${currentVersion.version}.json`
          : null,
    };
  });
}

async function fetchJobs(accountId: string): Promise<DashboardRecentJob[]> {
  const rows = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.accountId, accountId))
    .orderBy(desc(processingJobs.updatedAt))
    .limit(12);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    tilesetId: readStringField(row.input, "tilesetId"),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  }));
}

async function fetchAudit(accountId: string) {
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      resourceType: auditEvents.resourceType,
      resourceId: auditEvents.resourceId,
      timestamp: auditEvents.timestamp,
    })
    .from(auditEvents)
    .where(eq(auditEvents.profileId, accountId))
    .orderBy(desc(auditEvents.timestamp))
    .limit(12);

  return rows.map((row) => ({
    ...row,
    timestamp: row.timestamp.toISOString(),
  }));
}

async function fetchMonthlyUsage(accountId: string, start: Date) {
  const [row] = await db
    .select({
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
      errors:
        sql<number>`coalesce(sum(case when ${usageLogs.statusCode} >= 400 then 1 else 0 end), 0)`.as(
          "errors",
        ),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.profileId, accountId), gte(usageLogs.timestamp, start)));

  return {
    requests: Number(row?.requests ?? 0),
    units: Number(row?.units ?? 0),
    errors: Number(row?.errors ?? 0),
  };
}

async function fetchUsageRows(accountId: string, start: Date) {
  const day = sql<string>`to_char(${usageLogs.timestamp}, 'YYYY-MM-DD')`;
  return db
    .select({
      date: day,
      endpoint: usageLogs.endpoint,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.profileId, accountId), gte(usageLogs.timestamp, start)))
    .groupBy(day, usageLogs.endpoint);
}

async function fetchEndpointBreakdown(
  accountId: string,
  start: Date,
): Promise<DashboardEndpointBreakdown[]> {
  const rows = await db
    .select({
      endpoint: usageLogs.endpoint,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
      errorCount:
        sql<number>`coalesce(sum(case when ${usageLogs.statusCode} >= 400 then 1 else 0 end), 0)`.as(
          "error_count",
        ),
    })
    .from(usageLogs)
    .where(and(eq(usageLogs.profileId, accountId), gte(usageLogs.timestamp, start)))
    .groupBy(usageLogs.endpoint);

  const byCategory = new Map<string, DashboardEndpointBreakdown>();
  for (const row of rows) {
    const category = categorizeDashboardEndpoint(row.endpoint);
    const current =
      byCategory.get(category) ??
      ({ category, requests: 0, units: 0, errorCount: 0 } satisfies DashboardEndpointBreakdown);
    current.requests += Number(row.requests ?? 0);
    current.units += Number(row.units ?? 0);
    current.errorCount += Number(row.errorCount ?? 0);
    byCategory.set(category, current);
  }
  return [...byCategory.values()].sort((a, b) => b.requests - a.requests);
}

async function fetchTopApiKeys(
  accountId: string,
  start: Date,
): Promise<DashboardTopApiKey[]> {
  const rows = await db
    .select({
      apiKeyId: usageLogs.apiKeyId,
      name: apiKeys.name,
      requests: count(),
      units: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("units"),
      errorCount:
        sql<number>`coalesce(sum(case when ${usageLogs.statusCode} >= 400 then 1 else 0 end), 0)`.as(
          "error_count",
        ),
      lastUsedAt: sql<Date>`max(${usageLogs.timestamp})`.as("last_used_at"),
    })
    .from(usageLogs)
    .leftJoin(apiKeys, eq(apiKeys.id, usageLogs.apiKeyId))
    .where(and(eq(usageLogs.profileId, accountId), gte(usageLogs.timestamp, start)))
    .groupBy(usageLogs.apiKeyId, apiKeys.name)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  return rows.map((row) => ({
    apiKeyId: row.apiKeyId,
    name: row.name ?? "Session or deleted key",
    requests: Number(row.requests ?? 0),
    units: Number(row.units ?? 0),
    errorCount: Number(row.errorCount ?? 0),
    lastUsedAt: serializeDateTime(row.lastUsedAt),
  }));
}

function serializeDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchDashboardHealth(now: Date): Promise<DashboardHealthEntry[]> {
  const checkedAt = now.toISOString();
  const base = [
    makeHealthEntry({
      id: "api",
      label: "API",
      status: "healthy",
      message: `v${env.APP_VERSION}`,
      checkedAt,
    }),
  ];
  const [postgres, redis, worker, martin, valhalla, geocoding, storage] =
    await Promise.all([
      probePostgres(checkedAt),
      probeRedis(checkedAt),
      probeWorker(checkedAt),
      probeUrl("martin", "Martin", `${env.MARTIN_URL}/health`, true, checkedAt),
      probeValhalla(checkedAt),
      probeConfiguredOnly(
        "geocoding",
        "Geocoding",
        isPeliasConfigured(env.PELIAS_URL),
        checkedAt,
      ),
      probeStorage(checkedAt),
    ]);

  return [
    ...base,
    postgres,
    redis,
    worker,
    martin,
    valhalla,
    geocoding,
    storage,
    makeHealthEntry({
      id: "static-maps",
      label: "Static maps",
      status: normalizeHealthStatus("healthy", Boolean(env.STATIC_MAP_URL)),
      message: env.STATIC_MAP_URL ? "Renderer URL configured" : "No renderer URL",
      checkedAt,
    }),
    makeHealthEntry({
      id: "email",
      label: "Email",
      status: normalizeHealthStatus("healthy", Boolean(env.RESEND_API_KEY)),
      message: env.RESEND_API_KEY ? "Resend configured" : "Email disabled",
      checkedAt,
    }),
    makeHealthEntry({
      id: "billing",
      label: "Billing",
      status: normalizeHealthStatus("healthy", isBillingConfigured()),
      message: isBillingConfigured() ? "Checkout configured" : "Checkout disabled",
      checkedAt,
    }),
  ];
}

async function probeValhalla(checkedAt: string) {
  const result = await probeValhallaReadiness(env.VALHALLA_URL);
  return makeHealthEntry({
    id: "valhalla",
    label: "Valhalla",
    status:
      result.status === "ok"
        ? "healthy"
        : result.status === "unavailable"
          ? "offline"
          : "degraded",
    latencyMs: result.latency,
    message: result.status === "ok" ? null : result.message,
    checkedAt,
  });
}

async function probePostgres(checkedAt: string) {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return makeHealthEntry({
      id: "postgres",
      label: "Postgres",
      status: "healthy",
      latencyMs: Date.now() - startedAt,
      checkedAt,
    });
  } catch (error) {
    return makeHealthEntry({
      id: "postgres",
      label: "Postgres",
      status: "offline",
      latencyMs: Date.now() - startedAt,
      message: errorMessage(error),
      checkedAt,
    });
  }
}

async function probeRedis(checkedAt: string) {
  const startedAt = Date.now();
  try {
    const redis = createRedisClient();
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return makeHealthEntry({
      id: "redis",
      label: "Redis",
      status: "healthy",
      latencyMs: Date.now() - startedAt,
      checkedAt,
    });
  } catch (error) {
    return makeHealthEntry({
      id: "redis",
      label: "Redis",
      status: "offline",
      latencyMs: Date.now() - startedAt,
      message: errorMessage(error),
      checkedAt,
    });
  }
}

async function probeWorker(checkedAt: string) {
  const startedAt = Date.now();
  try {
    const redis = createRedisClient();
    await redis.connect();
    const heartbeat = await redis.get(WORKER_GEODATA_HEARTBEAT_KEY);
    await redis.quit();
    if (!heartbeat) {
      return makeHealthEntry({
        id: "worker-geodata",
        label: "worker-geodata",
        status: "offline",
        message: "No heartbeat",
        latencyMs: Date.now() - startedAt,
        checkedAt,
      });
    }
    const parsed = JSON.parse(heartbeat) as { timestamp?: string };
    const timestamp = parsed.timestamp ? Date.parse(parsed.timestamp) : NaN;
    const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null;
    return makeHealthEntry({
      id: "worker-geodata",
      label: "worker-geodata",
      status:
        ageMs !== null && ageMs <= WORKER_GEODATA_HEARTBEAT_STALE_MS
          ? "healthy"
          : "degraded",
      latencyMs: ageMs,
      message: ageMs === null ? "Invalid heartbeat" : `Heartbeat ${Math.round(ageMs / 1000)}s ago`,
      checkedAt,
    });
  } catch (error) {
    return makeHealthEntry({
      id: "worker-geodata",
      label: "worker-geodata",
      status: "offline",
      latencyMs: Date.now() - startedAt,
      message: errorMessage(error),
      checkedAt,
    });
  }
}

async function probeUrl(
  id: string,
  label: string,
  url: string,
  configured: boolean,
  checkedAt: string,
) {
  if (!configured) {
    return makeHealthEntry({
      id,
      label,
      status: "not_configured",
      message: "Not configured",
      checkedAt,
    });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return makeHealthEntry({
      id,
      label,
      status: response.ok ? "healthy" : "degraded",
      latencyMs: Date.now() - startedAt,
      message: response.ok ? null : `HTTP ${response.status}`,
      checkedAt,
    });
  } catch (error) {
    return makeHealthEntry({
      id,
      label,
      status: "offline",
      latencyMs: Date.now() - startedAt,
      message: errorMessage(error),
      checkedAt,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function probeConfiguredOnly(
  id: string,
  label: string,
  configured: boolean,
  checkedAt: string,
) {
  return makeHealthEntry({
    id,
    label,
    status: normalizeHealthStatus("healthy", configured),
    message: configured ? "Provider URL configured" : "Provider disabled",
    checkedAt,
  });
}

async function probeStorage(checkedAt: string) {
  const startedAt = Date.now();
  try {
    const provider = storageProviderFromEnv();
    if (provider === "local") {
      const storagePath =
        process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
      await access(storagePath);
      return makeHealthEntry({
        id: "storage",
        label: "Storage",
        status: "healthy",
        latencyMs: Date.now() - startedAt,
        message: `local path reachable: ${storagePath}`,
        checkedAt,
      });
    }

    const info = getStorage().getInfo();
    const configured =
      provider === "s3" ? Boolean(process.env.S3_BUCKET) : isR2Configured();
    return makeHealthEntry({
      id: "storage",
      label: "Storage",
      status: configured ? "healthy" : "degraded",
      latencyMs: Date.now() - startedAt,
      message: configured
        ? `${info.provider}${info.bucket ? `/${info.bucket}` : ""} configured`
        : `${provider.toUpperCase()} storage is not fully configured`,
      checkedAt,
    });
  } catch (error) {
    return makeHealthEntry({
      id: "storage",
      label: "Storage",
      status: "offline",
      latencyMs: Date.now() - startedAt,
      message: errorMessage(error),
      checkedAt,
    });
  }
}

function storageProviderFromEnv(): "local" | "s3" | "r2" {
  if (process.env.STORAGE_PROVIDER === "s3") return "s3";
  if (process.env.STORAGE_PROVIDER === "r2") return "r2";
  return "local";
}

function isR2Configured() {
  return (
    Boolean(process.env.R2_BUCKET || process.env.S3_BUCKET) &&
    Boolean(process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    Boolean(
      (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
        (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
    )
  );
}

function buildTimeseries(
  rows: Awaited<ReturnType<typeof fetchUsageRows>>,
  start: Date,
  now: Date,
): DashboardTimeseriesPoint[] {
  const points = emptyTimeseries(30, now);
  const byDate = new Map(points.map((point) => [point.date, point]));
  for (const row of rows) {
    if (Date.parse(row.date) < start.getTime()) continue;
    const point = byDate.get(row.date);
    if (!point) continue;
    const category = categorizeDashboardEndpoint(row.endpoint);
    const units = Number(row.units ?? row.requests ?? 0);
    point[category] += units;
    point.total += units;
  }
  return points;
}

function toDashboardTilesetVersion(
  version: typeof tilesetVersions.$inferSelect | null,
): DashboardRecentTilesetVersion | null {
  if (!version) return null;
  return {
    id: version.id,
    version: version.version,
    format: version.format,
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function createRedisClient() {
  return new Redis({
    ...redisConnection,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    lazyConnect: true,
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
