import { Hono } from "hono";
import { db } from "@planisfy/database";
import { WORKER_GEODATA_HEARTBEAT_KEY } from "@planisfy/geodata-contracts";
import { sql } from "drizzle-orm";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { env, redisConnection } from "../../env";
import { renderPrometheusMetrics } from "../../shared/metrics/metrics";
import { probeValhallaReadiness } from "../setup/valhalla-readiness";
import { isInternalRequestAuthorized } from "../../middleware/internal-auth";

export const healthRoute = new Hono();
type HealthCheck = {
  status: string;
  latency?: number;
  error?: string;
  provider?: string;
  bucket?: string;
  path?: string;
};

// ── GET /health — Basic readiness check ─────────────────────────────────────

healthRoute.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRoute.get("/metrics", (c) => {
  if (!isDiagnosticsRequestAllowed(c.req.raw.headers)) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Diagnostics access denied" } },
      401,
    );
  }

  return c.text(
    renderPrometheusMetrics({ service: "api", version: env.APP_VERSION }),
    200,
    { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  );
});

// ── GET /health/detailed — Deep health check with service probes ────────────

healthRoute.get("/health/detailed", async (c) => {
  if (!isDiagnosticsRequestAllowed(c.req.raw.headers)) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Diagnostics access denied" } },
      401,
    );
  }

  const checks: Record<string, HealthCheck> = {};
  let healthy = true;

  // PostgreSQL
  const pgStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.postgres = { status: "ok", latency: Date.now() - pgStart };
  } catch (err) {
    checks.postgres = { status: "error", latency: Date.now() - pgStart, error: err instanceof Error ? err.message : String(err) };
    healthy = false;
  }

  // Redis
  const redisStart = Date.now();
  try {
    const Redis = await import("ioredis").then((m) => m.default);
    const redis = new Redis({
      ...getRedisConnection(),
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    checks.redis = { status: "ok", latency: Date.now() - redisStart };

    const heartbeat = await redis.get(WORKER_GEODATA_HEARTBEAT_KEY);
    if (heartbeat) {
      const parsed = JSON.parse(heartbeat) as { timestamp?: string };
      const timestamp = parsed.timestamp ? Date.parse(parsed.timestamp) : NaN;
      const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null;
      checks.workerGeodata = {
        status: ageMs !== null && ageMs <= 60_000 ? "ok" : "degraded",
        latency: ageMs ?? undefined,
      };
    } else {
      checks.workerGeodata = { status: "unavailable" };
    }

    await redis.quit();
  } catch (err) {
    checks.redis = { status: "error", latency: Date.now() - redisStart, error: err instanceof Error ? err.message : String(err) };
    checks.workerGeodata = { status: "unknown", error: "Redis unavailable" };
    healthy = false;
  }

  const storageStart = Date.now();
  checks.storage = await checkStorageHealth(storageStart);
  if (checks.storage.status === "error") {
    healthy = false;
  }

  // Martin (tile server)
  const martinUrl = env.MARTIN_URL;
  const martinStart = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${martinUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    checks.martin = { status: res.ok ? "ok" : "degraded", latency: Date.now() - martinStart };
  } catch (err) {
    checks.martin = { status: "error", latency: Date.now() - martinStart, error: err instanceof Error ? err.message : String(err) };
    // Martin being down is degraded, not critical
  }

  checks.tileWorker = await checkTileWorkerHealth();
  if (
    env.TILE_DELIVERY_MODE === "worker" &&
    checks.tileWorker.status === "error"
  ) {
    healthy = false;
  }

  // Valhalla (routing)
  const valhalla = await probeValhallaReadiness(env.VALHALLA_URL);
  checks.valhalla = {
    status: valhalla.status,
    latency: valhalla.latency,
    error: valhalla.status === "ok" ? undefined : valhalla.message,
  };

  const status = healthy ? "ok" : "degraded";

  return c.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
      uptime: process.uptime(),
      checks,
    },
    healthy ? 200 : 503
  );
});

function getRedisConnection() {
  return redisConnection;
}

async function checkTileWorkerHealth(): Promise<HealthCheck> {
  if (env.TILE_DELIVERY_MODE !== "worker") {
    return { status: "disabled" };
  }
  if (!env.TILE_WORKER_URL) {
    return {
      status: "error",
      error: "TILE_WORKER_URL is required when TILE_DELIVERY_MODE=worker",
    };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${env.TILE_WORKER_URL.replace(/\/$/, "")}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      status: res.ok ? "ok" : "error",
      latency: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkStorageHealth(
  start = Date.now(),
): Promise<HealthCheck> {
  const provider = storageProviderFromEnv();

  if (provider === "local") {
    const storagePath =
      process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
    try {
      await access(storagePath);
      return {
        status: "ok",
        provider,
        bucket: process.env.LOCAL_STORAGE_BUCKET ?? "local",
        path: storagePath,
        latency: Date.now() - start,
      };
    } catch (err) {
      return {
        status: "error",
        provider,
        bucket: process.env.LOCAL_STORAGE_BUCKET ?? "local",
        path: storagePath,
        latency: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (provider === "s3") {
    return {
      status: process.env.S3_BUCKET ? "configured" : "degraded",
      provider,
      bucket: process.env.S3_BUCKET ?? "planisfy-uploads",
      latency: Date.now() - start,
      error: process.env.S3_BUCKET ? undefined : "S3_BUCKET is not configured",
    };
  }

  const r2Configured =
    Boolean(process.env.R2_BUCKET || process.env.S3_BUCKET) &&
    Boolean(process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    Boolean(
      (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
        (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
    );
  return {
    status: r2Configured ? "configured" : "degraded",
    provider,
    bucket: process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? "planisfy-uploads",
    latency: Date.now() - start,
    error: r2Configured
      ? undefined
      : "R2 bucket, endpoint/account, and credentials are not fully configured",
  };
}

function storageProviderFromEnv(): "local" | "s3" | "r2" {
  if (process.env.STORAGE_PROVIDER === "s3") return "s3";
  if (process.env.STORAGE_PROVIDER === "r2") return "r2";
  return "local";
}

function isDiagnosticsRequestAllowed(headers: Headers) {
  return (
    process.env.NODE_ENV !== "production" || isInternalRequestAuthorized(headers)
  );
}
