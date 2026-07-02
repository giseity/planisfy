import {
  PLANS,
  type BillingInterval,
  type CheckoutPlanSlug,
  type PlanDefinition,
  type PlanSlug,
} from "@planisfy/types";
import { env } from "../../env";

export type BillablePlanSlug = CheckoutPlanSlug;

export interface SubscriptionProduct {
  planId: BillablePlanSlug;
  interval: BillingInterval;
  productKey: BillablePlanSlug;
  productLabel: string;
  dodoProductId: string;
}

interface DodoProductEnv {
  DODO_STARTER_MONTHLY_PRODUCT_ID: string;
  DODO_STARTER_YEARLY_PRODUCT_ID: string;
  DODO_SCALE_MONTHLY_PRODUCT_ID: string;
  DODO_SCALE_YEARLY_PRODUCT_ID: string;
}

export function resolveSubscriptionProduct(
  planId: BillablePlanSlug,
  interval: BillingInterval = "monthly",
  source: DodoProductEnv = env,
): SubscriptionProduct | null {
  const dodoProductId = dodoProductIdForPlan(planId, interval, source);
  if (!dodoProductId) return null;

  const plan = PLANS[planId];
  return {
    planId,
    interval,
    productKey: planId,
    productLabel: subscriptionProductLabel(plan, interval),
    dodoProductId,
  };
}

export function lookupSubscriptionProduct(
  dodoProductId: string,
  source: DodoProductEnv = env,
): SubscriptionProduct | null {
  for (const planId of ["starter", "scale"] as const) {
    for (const interval of ["monthly", "yearly"] as const) {
      const product = resolveSubscriptionProduct(planId, interval, source);
      if (product?.dodoProductId === dodoProductId) return product;
    }
  }
  return null;
}

export function isCheckoutPlan(planId: PlanSlug): planId is BillablePlanSlug {
  return planId === "starter" || planId === "scale";
}

function subscriptionProductLabel(
  plan: PlanDefinition,
  interval: BillingInterval,
): string {
  const cadence = interval === "yearly" ? "Annual" : "Monthly";
  return `${plan.name} ${cadence} Subscription`;
}

function dodoProductIdForPlan(
  planId: BillablePlanSlug,
  interval: BillingInterval,
  source: DodoProductEnv,
) {
  if (planId === "starter") {
    if (interval === "yearly") return source.DODO_STARTER_YEARLY_PRODUCT_ID;
    return source.DODO_STARTER_MONTHLY_PRODUCT_ID;
  }
  if (interval === "yearly") return source.DODO_SCALE_YEARLY_PRODUCT_ID;
  return source.DODO_SCALE_MONTHLY_PRODUCT_ID;
}
