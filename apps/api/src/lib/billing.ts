import {
  PLANS,
  type PlanLimits,
  type PlanSlug,
} from "@planisfy/types";
import { env } from "../env";

export { PLANS };
export type { PlanLimits, PlanSlug };

export async function getUserPlan(userId: string): Promise<PlanSlug> {
  if (env.POLAR_ACCESS_TOKEN) {
    try {
      const plan = await getPolarSubscriptionPlan(userId);
      if (plan) return plan;
    } catch (err) {
      console.error(
        "[billing] Polar lookup failed, falling back to free:",
        err,
      );
    }
  }

  return "free";
}

export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  const plan = await getUserPlan(userId);
  return PLANS[plan] ?? PLANS.free;
}

const POLAR_API_URL = "https://api.polar.sh/v1";

async function polarFetch(path: string, options?: RequestInit) {
  const token = env.POLAR_ACCESS_TOKEN;
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

async function getPolarSubscriptionPlan(
  userId: string,
): Promise<PlanSlug | null> {
  try {
    const data = await polarFetch(
      `/subscriptions?customer_external_id=${userId}&active=true&limit=1`,
    );

    const sub = data.items?.[0];
    if (!sub) return null;

    const productName = sub.product?.name?.toLowerCase() || "";
    if (productName.includes("enterprise")) return "enterprise";
    if (productName.includes("pro")) return "pro";
    return "free";
  } catch {
    return null;
  }
}

export async function createCheckoutUrl(
  userId: string,
  priceId: string,
): Promise<string | null> {
  if (!env.POLAR_ACCESS_TOKEN) return null;

  try {
    const data = await polarFetch("/checkouts/custom", {
      method: "POST",
      body: JSON.stringify({
        product_price_id: priceId,
        customer_external_id: userId,
        success_url: `${env.CONSOLE_URL}/studio/settings?billing=success`,
        metadata: { userId },
      }),
    });

    return data.url || null;
  } catch (err) {
    console.error("[billing] Checkout creation failed:", err);
    return null;
  }
}

export async function getCustomerPortalUrl(
  userId: string,
): Promise<string | null> {
  if (!env.POLAR_ACCESS_TOKEN) return null;

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

export async function reportUsage(
  userId: string,
  units: number,
): Promise<void> {
  if (!env.POLAR_ACCESS_TOKEN) return;

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
    // Usage reporting is best-effort.
  }
}
