import { Hono } from "hono";
import { db } from "@planisfy/database";
import { sql } from "drizzle-orm";
import { env, redisConnection } from "../env";
import { renderPrometheusMetrics } from "../lib/metrics";

export const healthRoute = new Hono();
const WORKER_GEODATA_HEARTBEAT_KEY = "planisfy:worker-geodata:heartbeat";

// ── GET /health — Basic readiness check ─────────────────────────────────────

healthRoute.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRoute.get("/metrics", (c) => {
  return c.text(
    renderPrometheusMetrics({ service: "api", version: env.APP_VERSION }),
    200,
    { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  );
});

// ── GET /health/detailed — Deep health check with service probes ────────────

healthRoute.get("/health/detailed", async (c) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
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

  // Valhalla (routing)
  const valhallaUrl = env.VALHALLA_URL;
  const valhallaStart = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${valhallaUrl}/status`, { signal: controller.signal });
    clearTimeout(timeout);
    checks.valhalla = { status: res.ok ? "ok" : "degraded", latency: Date.now() - valhallaStart };
  } catch (err) {
    checks.valhalla = { status: "unavailable", latency: Date.now() - valhallaStart, error: err instanceof Error ? err.message : String(err) };
    // Valhalla being down is not critical
  }

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
