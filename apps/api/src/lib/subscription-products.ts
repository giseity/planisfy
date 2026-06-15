import { PLANS, type PlanDefinition, type PlanSlug } from "@planisfy/types";
import { env } from "../env";

export type BillablePlanSlug = Exclude<PlanSlug, "free">;

export interface SubscriptionProduct {
  planId: BillablePlanSlug;
  productKey: BillablePlanSlug;
  productLabel: string;
  dodoProductId: string;
}

interface DodoProductEnv {
  DODO_PRO_PRODUCT_ID: string;
  DODO_ENTERPRISE_PRODUCT_ID: string;
}

const PRODUCT_ENV_KEYS: Record<BillablePlanSlug, keyof DodoProductEnv> = {
  pro: "DODO_PRO_PRODUCT_ID",
  enterprise: "DODO_ENTERPRISE_PRODUCT_ID",
};

export function resolveSubscriptionProduct(
  planId: BillablePlanSlug,
  source: DodoProductEnv = env,
): SubscriptionProduct | null {
  const dodoProductId = source[PRODUCT_ENV_KEYS[planId]];
  if (!dodoProductId) return null;

  const plan = PLANS[planId];
  return {
    planId,
    productKey: planId,
    productLabel: subscriptionProductLabel(plan),
    dodoProductId,
  };
}

export function lookupSubscriptionProduct(
  dodoProductId: string,
  source: DodoProductEnv = env,
): SubscriptionProduct | null {
  for (const planId of Object.keys(PRODUCT_ENV_KEYS) as BillablePlanSlug[]) {
    const product = resolveSubscriptionProduct(planId, source);
    if (product?.dodoProductId === dodoProductId) return product;
  }
  return null;
}

export function isCheckoutPlan(planId: PlanSlug): planId is BillablePlanSlug {
  return planId === "pro" || planId === "enterprise";
}

function subscriptionProductLabel(plan: PlanDefinition): string {
  return `${plan.name} Subscription`;
}
