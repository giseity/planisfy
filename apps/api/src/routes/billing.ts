import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth";
import { getUserPlan, getPlanLimits, PLANS, createCheckoutUrl, getCustomerPortalUrl } from "../lib/billing";
import { getMonthlyUsagePeriod, getMonthlyUsageUnits } from "../lib/usage-quota";
import { db, styles, tilesets, apiKeys } from "@planisfy/database";
import { eq, and, isNull, count } from "drizzle-orm";
import { env } from "../env";

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

  const period = getMonthlyUsagePeriod();

  const [[styleCount], [tilesetCount], [keyCount], monthlyUnits] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(styles)
        .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt))),
      db
        .select({ count: count() })
        .from(tilesets)
        .where(
          and(eq(tilesets.accountId, ownerId), isNull(tilesets.deletedAt)),
        ),
      db
        .select({ count: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))),
      getMonthlyUsageUnits(ownerId, period.start),
    ]);

  const planInfo = PLANS[plan] ?? PLANS.free;

  return c.json({
    plan,
    planName: planInfo.name,
    price: planInfo.price,
    limits,
    usage: {
      monthlyUnits,
      styles: styleCount?.count ?? 0,
      sources: tilesetCount?.count ?? 0,
      apiKeys: keyCount?.count ?? 0,
    },
    quotaPercent: limits.monthlyUnits === Infinity
      ? 0
      : Math.round((monthlyUnits / limits.monthlyUnits) * 100),
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    polarConfigured: !!env.POLAR_ACCESS_TOKEN,
  });
});

// ── GET /billing/plans — Available plans ────────────────────────────────────

billingRoute.get("/billing/plans", async (c) => {
  const plans = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    price: plan.price,
    requestsPerMinute: plan.requestsPerMinute,
    monthlyUnits:
      plan.monthlyUnits === Infinity ? "Unlimited" : plan.monthlyUnits,
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
