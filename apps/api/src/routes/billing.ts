import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth";
import { getUserPlan, getPlanLimits, PLANS, createCheckoutUrl, getCustomerPortalUrl } from "../lib/billing";
import { db, styles, tilesetSources, apiKeys, usageLogs } from "@planisfy/database";
import { eq, and, isNull, count, sql, gte } from "drizzle-orm";

const checkoutSchema = z.object({
  priceId: z.string().min(1, "priceId is required").max(256),
});

export const billingRoute = new Hono<AuthEnv>();

// ── GET /billing — Current plan, usage, and limits ──────────────────────────

billingRoute.get("/billing", async (c) => {
  const userId = c.get("userId");
  const ownerId = c.get("ownerId");

  const [plan, limits] = await Promise.all([
    getUserPlan(userId),
    getPlanLimits(userId),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[styleCount], [sourceCount], [keyCount], [usageRow]] = await Promise.all([
    db.select({ count: count() }).from(styles).where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt))),
    db.select({ count: count() }).from(tilesetSources).where(and(eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt))),
    db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))),
    db.select({ total: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`.as("total") })
      .from(usageLogs)
      .where(and(eq(usageLogs.profileId, ownerId), gte(usageLogs.timestamp, monthStart))),
  ]);

  const planInfo = PLANS[plan] ?? PLANS.free!;

  return c.json({
    plan,
    planName: planInfo!.name,
    price: planInfo!.price,
    limits,
    usage: {
      monthlyUnits: Number(usageRow?.total ?? 0),
      styles: styleCount?.count ?? 0,
      sources: sourceCount?.count ?? 0,
      apiKeys: keyCount?.count ?? 0,
    },
    quotaPercent: limits.monthlyUnits === Infinity
      ? 0
      : Math.round((Number(usageRow?.total ?? 0) / limits.monthlyUnits) * 100),
    polarConfigured: !!process.env.POLAR_ACCESS_TOKEN,
  });
});

// ── GET /billing/plans — Available plans ────────────────────────────────────

billingRoute.get("/billing/plans", async (c) => {
  const plans = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    ...plan,
    monthlyUnits: plan.monthlyUnits === Infinity ? "Unlimited" : plan.monthlyUnits,
    maxStyles: plan.maxStyles === Infinity ? "Unlimited" : plan.maxStyles,
    maxSources: plan.maxSources === Infinity ? "Unlimited" : plan.maxSources,
    maxApiKeys: plan.maxApiKeys === Infinity ? "Unlimited" : plan.maxApiKeys,
  }));

  return c.json(plans);
});

// ── POST /billing/checkout — Create a checkout session ──────────────────────

billingRoute.post("/billing/checkout", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { priceId } = checkoutSchema.parse(body);

  const url = await createCheckoutUrl(userId, priceId);

  if (!url) {
    return c.json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Billing is not configured. Set POLAR_ACCESS_TOKEN to enable payments.",
      },
    }, 503);
  }

  return c.json({ url });
});

// ── GET /billing/portal — Get customer portal URL ───────────────────────────

billingRoute.get("/billing/portal", async (c) => {
  const userId = c.get("userId");

  const url = await getCustomerPortalUrl(userId);

  if (!url) {
    return c.json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Billing portal is not configured.",
      },
    }, 503);
  }

  return c.json({ url });
});
