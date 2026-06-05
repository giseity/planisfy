import { Hono } from "hono";
import { z } from "zod";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import type { AuthEnv } from "../middleware/auth";
import {
  applyDodoWebhookEvent,
  createCheckoutSession,
  getAccountPlan,
  getAccountPlanLimits,
  getCustomerPortalUrl,
  isBillingConfigured,
  isCheckoutConfiguredForPlan,
  PLANS,
  serializePlanLimits,
} from "../lib/billing";
import { getMonthlyUsagePeriod, getMonthlyUsageUnits } from "../lib/usage-quota";
import { db, styles, tilesets, apiKeys } from "@planisfy/database";
import { eq, and, isNull, count } from "drizzle-orm";
import { env } from "../env";

const checkoutSchema = z.object({
  planId: z.enum(["pro", "enterprise"]),
});

export const billingRoute = new Hono<AuthEnv>();
export const billingWebhookRoute = new Hono();

// ── GET /billing — Current plan, usage, and limits ──────────────────────────

billingRoute.get("/billing", async (c) => {
  const ownerId = c.get("ownerId");

  const [plan, limits] = await Promise.all([
    getAccountPlan(ownerId),
    getAccountPlanLimits(ownerId),
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
  const serializedLimits = serializePlanLimits(limits);

  return c.json({
    plan,
    planName: planInfo.name,
    price: planInfo.price,
    limits: serializedLimits,
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
    billingConfigured: isBillingConfigured(),
    portalAvailable: false,
  });
});

// ── GET /billing/plans — Available plans ────────────────────────────────────

billingRoute.get("/billing/plans", async (c) => {
  const plans = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    price: plan.price,
    checkoutAvailable: isCheckoutConfiguredForPlan(plan.id),
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
  const ownerId = c.get("ownerId");
  const body = await c.req.json();
  const { planId } = checkoutSchema.parse(body);

  const session = await createCheckoutSession({
    userId,
    accountId: ownerId,
    planId,
  });

  if (!session) {
    return c.json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Billing is not configured. Set Dodo Payments credentials and product IDs to enable payments.",
      },
    }, 503);
  }

  return c.json(session);
});

// ── GET /billing/portal — Get customer portal URL ───────────────────────────

billingRoute.get("/billing/portal", async (c) => {
  const url = await getCustomerPortalUrl();

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

billingWebhookRoute.post("/webhooks/dodo", async (c) => {
  if (!env.DODO_PAYMENTS_WEBHOOK_SECRET) {
    return c.json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Dodo webhook secret is not configured.",
      },
    }, 503);
  }

  const rawBody = await c.req.text();
  let payload: unknown;

  try {
    const webhook = new Webhook(env.DODO_PAYMENTS_WEBHOOK_SECRET);
    payload = webhook.verify(rawBody, Object.fromEntries(c.req.raw.headers));
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return c.json({
        error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." },
      }, 401);
    }
    throw err;
  }

  const result = await applyDodoWebhookEvent(payload as Record<string, unknown>);
  return c.json({ data: result });
});
