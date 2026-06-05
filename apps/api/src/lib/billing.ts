import {
  billingCustomers,
  billingTransactions,
  db,
  plans,
  profiles,
  subscriptions,
  users,
} from "@planisfy/database";
import {
  PLANS,
  type PlanDefinition,
  type PlanLimits,
  type PlanSlug,
} from "@planisfy/types";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { env } from "../env";

export { PLANS };
export type { PlanLimits, PlanSlug };

type BillablePlanSlug = Exclude<PlanSlug, "free">;
type SerializedPlanLimits = {
  monthlyUnits: number | null;
  requestsPerMinute: number;
  maxStyles: number | null;
  maxSources: number | null;
  maxApiKeys: number | null;
};

interface DodoCheckoutResponse {
  checkout_url?: string;
  checkoutUrl?: string;
  session_id?: string;
  sessionId?: string;
  id?: string;
}

export interface CheckoutSession {
  url: string;
  checkoutId: string | null;
}

interface DodoWebhookPayload {
  type?: string;
  event_type?: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function serializePlanLimits(limits: PlanLimits): SerializedPlanLimits {
  return {
    monthlyUnits: limits.monthlyUnits === Infinity ? null : limits.monthlyUnits,
    requestsPerMinute: limits.requestsPerMinute,
    maxStyles: limits.maxStyles === Infinity ? null : limits.maxStyles,
    maxSources: limits.maxSources === Infinity ? null : limits.maxSources,
    maxApiKeys: limits.maxApiKeys === Infinity ? null : limits.maxApiKeys,
  };
}

export function isBillingConfigured(): boolean {
  return Boolean(env.DODO_PAYMENTS_API_KEY && env.DODO_PRO_PRODUCT_ID);
}

export function isCheckoutConfiguredForPlan(planId: PlanSlug): boolean {
  return planId !== "free" && Boolean(env.DODO_PAYMENTS_API_KEY && getDodoProductId(planId));
}

export async function ensureBillingPlans() {
  const values = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    limits: serializePlanLimits(plan),
    active: true,
  }));

  await db
    .insert(plans)
    .values(values)
    .onConflictDoUpdate({
      target: plans.id,
      set: {
        name: sql`excluded.name`,
        limits: sql`excluded.limits`,
        active: true,
      },
    });
}

export async function getAccountPlan(accountId: string): Promise<PlanSlug> {
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, accountId),
        or(
          eq(subscriptions.status, "ACTIVE"),
          eq(subscriptions.status, "TRIALING"),
        ),
        or(
          isNull(subscriptions.currentPeriodEnd),
          gt(subscriptions.currentPeriodEnd, new Date()),
        ),
      ),
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  return isPlanSlug(subscription?.planId) ? subscription.planId : "free";
}

export async function getUserPlan(userId: string): Promise<PlanSlug> {
  return getAccountPlan(userId);
}

export async function getAccountPlanLimits(
  accountId: string,
): Promise<PlanLimits> {
  const plan = await getAccountPlan(accountId);
  return PLANS[plan] ?? PLANS.free;
}

export async function getPlanLimits(accountId: string): Promise<PlanLimits> {
  return getAccountPlanLimits(accountId);
}

export async function createCheckoutSession(params: {
  userId: string;
  accountId: string;
  planId: BillablePlanSlug;
}): Promise<CheckoutSession | null> {
  const productId = getDodoProductId(params.planId);
  if (!env.DODO_PAYMENTS_API_KEY || !productId) return null;

  await ensureBillingPlans();

  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
      displayName: profiles.displayName,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.id, users.id))
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user?.email) {
    throw new Error("Cannot create checkout without a user email");
  }

  const body = {
    customer: {
      email: user.email,
      name: user.name || user.displayName || user.email,
    },
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: `${env.CONSOLE_URL}/studio/settings?billing=success`,
    cancel_url: `${env.CONSOLE_URL}/studio/settings?billing=cancelled`,
    metadata: {
      userId: params.userId,
      accountId: params.accountId,
      planId: params.planId,
    },
  };

  const data = await dodoFetch<DodoCheckoutResponse>("/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const url = data.checkout_url ?? data.checkoutUrl;
  if (!url) {
    throw new Error("Dodo checkout response did not include a checkout URL");
  }

  const checkoutId = data.session_id ?? data.sessionId ?? data.id ?? null;

  await db.insert(billingTransactions).values({
    accountId: params.accountId,
    provider: "DODO",
    status: "CHECKOUT_CREATED",
    providerCheckoutId: checkoutId,
    metadata: {
      planId: params.planId,
      productId,
      userId: params.userId,
    },
  });

  return { url, checkoutId };
}

export async function createCheckoutUrl(
  userId: string,
  planId: BillablePlanSlug,
  accountId = userId,
): Promise<string | null> {
  const session = await createCheckoutSession({ userId, accountId, planId });
  return session?.url ?? null;
}

export async function getCustomerPortalUrl(): Promise<string | null> {
  return null;
}

export async function reportUsage(): Promise<void> {
  // Dodo subscription usage metering is not wired yet. Keep request logging as
  // the source of truth for Planisfy quotas.
}

export async function applyDodoWebhookEvent(payload: DodoWebhookPayload) {
  await ensureBillingPlans();

  const eventType = payload.type ?? payload.event_type ?? "unknown";
  const data = isRecord(payload.data)
    ? payload.data
    : isRecord(payload.payload)
      ? payload.payload
      : {};
  const metadata = readMetadata(payload, data);
  const accountId = stringValue(metadata.accountId);
  const planId = readPlanId(metadata, data);

  if (!accountId || !planId) {
    return { applied: false, reason: "missing-account-or-plan", eventType };
  }

  const customerId = readFirstString(data, [
    "customer_id",
    "customerId",
    "customer.customer_id",
    "customer.customerId",
    "customer.id",
  ]);
  const subscriptionId = readFirstString(data, [
    "subscription_id",
    "subscriptionId",
    "subscription.id",
    "id",
  ]);
  const checkoutId = readFirstString(data, [
    "checkout_id",
    "checkoutId",
    "checkout.session_id",
    "checkout.sessionId",
    "session_id",
  ]);
  const orderId = readFirstString(data, ["order_id", "orderId", "payment_id"]);
  const status = mapSubscriptionStatus(eventType, stringValue(data.status));
  const periodStart = dateValue(
    readFirst(data, ["current_period_start", "currentPeriodStart"]),
  );
  const periodEnd = dateValue(
    readFirst(data, ["current_period_end", "currentPeriodEnd"]),
  );

  if (customerId) {
    await db
      .insert(billingCustomers)
      .values({
        accountId,
        provider: "DODO",
        providerCustomerId: customerId,
        email: stringValue(readFirst(data, ["customer.email", "email"])),
        metadata: data,
      })
      .onConflictDoUpdate({
        target: [billingCustomers.provider, billingCustomers.providerCustomerId],
        set: {
          accountId,
          email: stringValue(readFirst(data, ["customer.email", "email"])),
          metadata: data,
        },
      });
  }

  if (checkoutId) {
    await db
      .insert(billingTransactions)
      .values({
        accountId,
        provider: "DODO",
        status: eventType,
        providerCheckoutId: checkoutId,
        providerOrderId: orderId,
        providerCustomerId: customerId,
        metadata: data,
        paidAt: status === "ACTIVE" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [
          billingTransactions.provider,
          billingTransactions.providerCheckoutId,
        ],
        set: {
          status: eventType,
          providerOrderId: orderId,
          providerCustomerId: customerId,
          metadata: data,
          paidAt: status === "ACTIVE" ? new Date() : null,
        },
      });
  }

  if (subscriptionId) {
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, subscriptionId))
      .limit(1);

    if (existing) {
      await db
        .update(subscriptions)
        .set({
          accountId,
          planId,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })
        .where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values({
        accountId,
        planId,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        providerSubscriptionId: subscriptionId,
      });
    }
  }

  return {
    applied: true,
    eventType,
    accountId,
    planId,
    status,
    subscriptionId,
  };
}

function getDodoProductId(planId: BillablePlanSlug): string | undefined {
  if (planId === "pro") return env.DODO_PRO_PRODUCT_ID;
  if (planId === "enterprise") return env.DODO_ENTERPRISE_PRODUCT_ID;
}

function getDodoApiUrl(): string {
  const url = env.DODO_PAYMENTS_API_URL ?? (
    env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com"
  );
  return url.replace(/\/$/, "");
}

async function dodoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = env.DODO_PAYMENTS_API_KEY;
  if (!token) throw new Error("DODO_PAYMENTS_API_KEY not configured");

  const res = await fetch(`${getDodoApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dodo API error: ${res.status} ${body}`);
  }

  return res.json() as Promise<T>;
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return value === "free" || value === "pro" || value === "enterprise";
}

function readPlanId(
  metadata: Record<string, unknown>,
  data: Record<string, unknown>,
): BillablePlanSlug | null {
  const metadataPlan = stringValue(metadata.planId);
  if (metadataPlan === "pro" || metadataPlan === "enterprise") {
    return metadataPlan;
  }

  const productId = readFirstString(data, [
    "product_id",
    "productId",
    "product.product_id",
    "product.id",
  ]);
  const matching = Object.values(PLANS).find(
    (plan: PlanDefinition) =>
      plan.id !== "free" && getDodoProductId(plan.id) === productId,
  );

  return matching?.id === "pro" || matching?.id === "enterprise"
    ? matching.id
    : null;
}

function readMetadata(
  payload: DodoWebhookPayload,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const direct = payload.metadata ?? data.metadata;
  return isRecord(direct) ? direct : {};
}

function mapSubscriptionStatus(
  eventType: string,
  rawStatus: string | null,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING" | "INACTIVE" {
  const status = `${eventType} ${rawStatus ?? ""}`.toLowerCase();
  if (status.includes("trial")) return "TRIALING";
  if (status.includes("cancel") || status.includes("expired")) {
    return "CANCELED";
  }
  if (
    status.includes("past_due") ||
    status.includes("failed") ||
    status.includes("unpaid")
  ) {
    return "PAST_DUE";
  }
  if (status.includes("active") || status.includes("success")) {
    return "ACTIVE";
  }
  return "INACTIVE";
}

function readFirstString(
  data: Record<string, unknown>,
  paths: string[],
): string | null {
  return stringValue(readFirst(data, paths));
}

function readFirst(
  data: Record<string, unknown>,
  paths: string[],
): unknown {
  for (const path of paths) {
    const value = readPath(data, path);
    if (value !== undefined && value !== null) return value;
  }
}

function readPath(data: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = data;
  for (const segment of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
