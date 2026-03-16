// ── Billing & Plan Management ────────────────────────────────────────────────
// Integrates with Polar (polar.sh) for subscriptions.
// Works without POLAR_ACCESS_TOKEN — defaults to free plan.

import { db, users } from "@planisfy/database";
import { eq } from "drizzle-orm";

// ── Plan definitions ────────────────────────────────────────────────────────

export interface PlanLimits {
  monthlyUnits: number;
  requestsPerMinute: number;
  maxStyles: number;
  maxSources: number;
  maxApiKeys: number;
}

export const PLANS: Record<string, PlanLimits & { name: string; price: number }> = {
  free: {
    name: "Free",
    price: 0,
    monthlyUnits: 50_000,
    requestsPerMinute: 100,
    maxStyles: 5,
    maxSources: 3,
    maxApiKeys: 5,
  },
  pro: {
    name: "Pro",
    price: 29,
    monthlyUnits: 500_000,
    requestsPerMinute: 500,
    maxStyles: 50,
    maxSources: 25,
    maxApiKeys: 25,
  },
  enterprise: {
    name: "Enterprise",
    price: 199,
    monthlyUnits: Infinity,
    requestsPerMinute: 2000,
    maxStyles: Infinity,
    maxSources: Infinity,
    maxApiKeys: Infinity,
  },
};

// ── Plan resolution ─────────────────────────────────────────────────────────

export async function getUserPlan(userId: string): Promise<string> {
  // If Polar is configured, check subscription status
  if (process.env.POLAR_ACCESS_TOKEN) {
    try {
      const plan = await getPolarSubscriptionPlan(userId);
      if (plan) return plan;
    } catch (err) {
      console.error("[billing] Polar lookup failed, falling back to free:", err);
    }
  }

  return "free";
}

export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  const plan = await getUserPlan(userId);
  return PLANS[plan] ?? PLANS.free!;
}

// ── Polar integration ───────────────────────────────────────────────────────

const POLAR_API_URL = "https://api.polar.sh/v1";

async function polarFetch(path: string, options?: RequestInit) {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error("POLAR_ACCESS_TOKEN not configured");

  const res = await fetch(`${POLAR_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Polar API error: ${res.status} ${body}`);
  }

  return res.json();
}

async function getPolarSubscriptionPlan(userId: string): Promise<string | null> {
  try {
    const data = await polarFetch(
      `/subscriptions?customer_external_id=${userId}&active=true&limit=1`
    );

    const sub = data.items?.[0];
    if (!sub) return null;

    // Map Polar product/price to plan name
    const productName = sub.product?.name?.toLowerCase() || "";
    if (productName.includes("enterprise")) return "enterprise";
    if (productName.includes("pro")) return "pro";
    return "free";
  } catch {
    return null;
  }
}

export async function createCheckoutUrl(userId: string, priceId: string): Promise<string | null> {
  if (!process.env.POLAR_ACCESS_TOKEN) return null;

  try {
    const data = await polarFetch("/checkouts/custom", {
      method: "POST",
      body: JSON.stringify({
        product_price_id: priceId,
        customer_external_id: userId,
        success_url: `${process.env.CONSOLE_URL || "http://localhost:3001"}/studio/settings?billing=success`,
        metadata: { userId },
      }),
    });

    return data.url || null;
  } catch (err) {
    console.error("[billing] Checkout creation failed:", err);
    return null;
  }
}

export async function getCustomerPortalUrl(userId: string): Promise<string | null> {
  if (!process.env.POLAR_ACCESS_TOKEN) return null;

  try {
    const data = await polarFetch("/customer-sessions", {
      method: "POST",
      body: JSON.stringify({
        customer_external_id: userId,
      }),
    });

    return data.customer_portal_url || null;
  } catch (err) {
    console.error("[billing] Portal URL creation failed:", err);
    return null;
  }
}

// ── Usage tracking ──────────────────────────────────────────────────────────

export async function reportUsage(userId: string, units: number): Promise<void> {
  if (!process.env.POLAR_ACCESS_TOKEN) return;

  try {
    await polarFetch("/usage/record", {
      method: "POST",
      body: JSON.stringify({
        customer_external_id: userId,
        meter_slug: "api-units",
        value: units,
      }),
    });
  } catch {
    // Usage reporting is best-effort
  }
}
