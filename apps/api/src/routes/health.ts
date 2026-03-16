import { Hono } from "hono";
import { db } from "@planisfy/database";
import { sql } from "drizzle-orm";

export const healthRoute = new Hono();

// ── GET /health — Basic readiness check ─────────────────────────────────────

healthRoute.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
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
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    checks.redis = { status: "ok", latency: Date.now() - redisStart };
    await redis.quit();
  } catch (err) {
    checks.redis = { status: "error", latency: Date.now() - redisStart, error: err instanceof Error ? err.message : String(err) };
    healthy = false;
  }

  // Martin (tile server)
  const martinUrl = process.env.MARTIN_URL || "http://localhost:3005";
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
  const valhallaUrl = process.env.VALHALLA_URL || "http://localhost:3007";
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
      version: process.env.APP_VERSION || "dev",
      uptime: process.uptime(),
      checks,
    },
    healthy ? 200 : 503
  );
});
