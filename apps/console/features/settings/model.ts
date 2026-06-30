export interface ProfileData {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface BillingInfo {
  deploymentMode: "self_host" | "managed";
  billingStatus:
    | "configured"
    | "checkout_unavailable"
    | "active_subscription"
    | "past_due"
    | "canceled"
    | "free_plan"
    | "self_hosted";
  plan: string;
  planName: string;
  price: number;
  limits: {
    monthlyUnits: number | null;
    requestsPerMinute: number;
    maxStyles: number | null;
    maxSources: number | null;
    maxApiKeys: number | null;
  };
  usage: {
    monthlyUnits: number;
    styles: number;
    sources: number;
    apiKeys: number;
  };
  quotaPercent: number;
  billingConfigured: boolean;
  portalAvailable: boolean;
}

export interface BillingTransaction {
  id: string;
  provider: string;
  type: string;
  status: string;
  providerCheckoutId: string | null;
  providerOrderId: string | null;
  productKey: string;
  productLabel: string;
  amountCents: number | null;
  currency: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanInfo {
  id: string;
  productId: string;
  name: string;
  price: number;
  priceLabel: string;
  period: string;
  checkout: boolean;
  checkoutAvailable: boolean;
  pricing: Partial<
    Record<
      "monthly" | "yearly",
      {
        interval: "monthly" | "yearly";
        price: number;
        priceLabel: string;
        period: string;
      }
    >
  >;
  features: string[];
  monthlyUnits: string | number;
  requestsPerMinute: number;
  maxStyles: string | number;
  maxSources: string | number;
  maxApiKeys: string | number;
}

export interface SecurityActivity {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  timestamp: string;
}

export interface SessionData {
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function formatLimit(limit: number | null): string {
  return limit === null ? "\u221e" : limit.toLocaleString();
}

export function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("curl")) return "curl";
  return "Unknown browser";
}

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function billingStatusLabel(status: BillingInfo["billingStatus"]) {
  if (status === "self_hosted") return "Self-host read-only";
  if (status === "checkout_unavailable") return "Checkout unavailable";
  if (status === "active_subscription") return "Active subscription";
  if (status === "free_plan") return "Free plan";
  if (status === "past_due") return "Past due";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function billingStatusVariant(status: BillingInfo["billingStatus"]) {
  if (status === "active_subscription") {
    return "success";
  }
  if (status === "checkout_unavailable" || status === "past_due") {
    return "warning";
  }
  if (status === "self_hosted") return "secondary";
  if (status === "canceled") return "destructive";
  return "secondary";
}
