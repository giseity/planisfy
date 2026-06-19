import { Hono } from "hono";
import { z } from "zod";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import type { AuthEnv } from "../middleware/auth";
import {
  applyDodoWebhookEvent,
  createCheckoutSession,
  getAccountBillingStatus,
  getAccountPlan,
  getAccountPlanLimits,
  getPlanDefinition,
  getCustomerPortalUrl,
  isBillingConfigured,
  isCheckoutConfiguredForPlan,
  listPlanDefinitions,
  serializePlanLimits,
} from "../lib/billing";
import {
  getMonthlyUsagePeriod,
  getMonthlyUsageUnits,
} from "../lib/usage-quota";
import {
  db,
  styles,
  tilesets,
  apiKeys,
  billingTransactions,
  billingWebhookEvents,
} from "@planisfy/database";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import { env } from "../env";
import { requireOrgPermission } from "../middleware/auth";

const checkoutSchema = z.object({
  planId: z.enum(["pro", "enterprise"]),
});

export const billingRoute = new Hono<AuthEnv>();
export const billingWebhookRoute = new Hono();

billingRoute.use("/billing", requireOrgPermission("billing.manage"));
billingRoute.use("/billing/*", requireOrgPermission("billing.manage"));

type BillingTransactionRow = typeof billingTransactions.$inferSelect;

export function serializeBillingTransaction(row: BillingTransactionRow) {
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    status: row.status,
    providerCheckoutId: row.providerCheckoutId,
    providerOrderId: row.providerOrderId,
    productKey: row.productKey,
    productLabel: row.productLabel,
    amountCents: row.amountCents,
    currency: row.currency,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── GET /billing — Current plan, usage, and limits ──────────────────────────

billingRoute.get("/billing", async (c) => {
  const ownerId = c.get("ownerId");

  const [plan, limits] = await Promise.all([
    getAccountPlan(ownerId),
    getAccountPlanLimits(ownerId),
  ]);
  const billingStatus = await getAccountBillingStatus(ownerId);

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
        .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true))),
      getMonthlyUsageUnits(ownerId, period.start),
    ]);

  const planInfo = await getPlanDefinition(plan);
  const serializedLimits = serializePlanLimits(limits);

  return c.json({
    deploymentMode: env.DEPLOYMENT_MODE,
    billingStatus,
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
    quotaPercent:
      limits.monthlyUnits === Infinity
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
  const plans = (await listPlanDefinitions()).map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    name: plan.name,
    price: plan.price,
    checkoutAvailable: isCheckoutConfiguredForPlan(plan.id),
    requestsPerMinute: plan.limits.requestsPerMinute,
    monthlyUnits:
      plan.limits.monthlyUnits === Infinity
        ? "Unlimited"
        : plan.limits.monthlyUnits,
    maxStyles:
      plan.limits.maxStyles === Infinity ? "Unlimited" : plan.limits.maxStyles,
    maxSources:
      plan.limits.maxSources === Infinity
        ? "Unlimited"
        : plan.limits.maxSources,
    maxApiKeys:
      plan.limits.maxApiKeys === Infinity
        ? "Unlimited"
        : plan.limits.maxApiKeys,
  }));

  return c.json(plans);
});

// ── GET /billing/transactions — Local Dodo transaction ledger ───────────────

billingRoute.get("/billing/transactions", async (c) => {
  const ownerId = c.get("ownerId");

  const rows = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.accountId, ownerId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(25);

  return c.json({ data: rows.map(serializeBillingTransaction) });
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
    return c.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message:
            "Billing is not configured. Set Dodo Payments credentials and product IDs to enable payments.",
        },
      },
      503,
    );
  }

  return c.json(session);
});

// ── GET /billing/portal — Get customer portal URL ───────────────────────────

billingRoute.get("/billing/portal", async (c) => {
  const url = await getCustomerPortalUrl();

  if (!url) {
    return c.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Billing portal is not configured.",
        },
      },
      503,
    );
  }

  return c.json({ url });
});

billingWebhookRoute.post("/webhooks/dodo", async (c) => {
  if (!env.DODO_PAYMENTS_WEBHOOK_SECRET) {
    return c.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Dodo webhook secret is not configured.",
        },
      },
      503,
    );
  }

  const rawBody = await c.req.text();
  let payload: unknown;

  try {
    const webhook = new Webhook(env.DODO_PAYMENTS_WEBHOOK_SECRET);
    payload = webhook.verify(rawBody, Object.fromEntries(c.req.raw.headers));
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return c.json(
        {
          error: {
            code: "INVALID_SIGNATURE",
            message: "Invalid webhook signature.",
          },
        },
        401,
      );
    }
    throw err;
  }

  const webhookId = c.req.header("webhook-id");
  const eventPayload = payload as Record<string, unknown>;
  const claimed = webhookId
    ? await claimDodoWebhookEvent(webhookId, eventPayload)
    : true;
  if (!claimed) {
    return c.json({
      data: {
        applied: false,
        reason: "duplicate-webhook",
        webhookId,
      },
    });
  }

  try {
    const result = await applyDodoWebhookEvent(eventPayload, {
      webhookId,
      webhookTimestamp: c.req.header("webhook-timestamp"),
    });
    if (webhookId) await markDodoWebhookProcessed(webhookId, result);
    return c.json({ data: result });
  } catch (err) {
    if (webhookId) await releaseDodoWebhookClaim(webhookId);
    throw err;
  }
});

async function claimDodoWebhookEvent(
  webhookId: string,
  payload: Record<string, unknown>,
) {
  const [event] = await db
    .insert(billingWebhookEvents)
    .values({
      provider: "DODO",
      webhookId,
      eventType: stringValue(payload.type),
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: billingWebhookEvents.id });

  return Boolean(event);
}

async function markDodoWebhookProcessed(webhookId: string, result: unknown) {
  await db
    .update(billingWebhookEvents)
    .set({ result, processedAt: new Date() })
    .where(
      and(
        eq(billingWebhookEvents.provider, "DODO"),
        eq(billingWebhookEvents.webhookId, webhookId),
      ),
    );
}

async function releaseDodoWebhookClaim(webhookId: string) {
  await db
    .delete(billingWebhookEvents)
    .where(
      and(
        eq(billingWebhookEvents.provider, "DODO"),
        eq(billingWebhookEvents.webhookId, webhookId),
        isNull(billingWebhookEvents.processedAt),
      ),
    );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
