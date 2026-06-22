import type {
  ExecutionTargetAuthMode,
  ExecutionTargetProvider,
} from "@/lib/api";

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
    | "free_plan";
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

export type JsonValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[];

export const EXECUTION_PROVIDER_PRESETS: Record<
  ExecutionTargetProvider,
  {
    authMode: ExecutionTargetAuthMode;
    region: string;
    config: Record<string, JsonValue>;
    credentials: Record<string, JsonValue>;
    profile: {
      image: string;
      cpu: string;
      memory: string;
      timeout: string;
      concurrency: string;
    };
  }
> = {
  local: {
    authMode: "federated",
    region: "local",
    config: {
      queue: "geodata",
      maxConcurrentJobs: 2,
      workingDirectory: "/data/storage",
    },
    credentials: {},
    profile: {
      image: "",
      cpu: "2",
      memory: "4096",
      timeout: "900",
      concurrency: "2",
    },
  },
  aws_batch: {
    authMode: "federated",
    region: "us-east-1",
    config: {
      jobQueue: "planisfy-geodata",
      jobDefinition: "planisfy-geodata-worker",
      retryAttempts: 1,
    },
    credentials: {
      roleArn: "",
    },
    profile: {
      image: "ghcr.io/planisfy/worker-geodata:latest",
      cpu: "4",
      memory: "8192",
      timeout: "3600",
      concurrency: "4",
    },
  },
  gcp_batch: {
    authMode: "federated",
    region: "us-central1",
    config: {
      projectId: "",
      location: "us-central1",
      jobNamePrefix: "planisfy-geodata",
    },
    credentials: {
      serviceAccountEmail: "",
    },
    profile: {
      image: "ghcr.io/planisfy/worker-geodata:latest",
      cpu: "4",
      memory: "8192",
      timeout: "3600",
      concurrency: "4",
    },
  },
};

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

export function targetLabel(provider: ExecutionTargetProvider) {
  if (provider === "aws_batch") return "AWS Batch";
  if (provider === "gcp_batch") return "Google Cloud Batch";
  return "Local";
}

export function parseJsonObject(value: string, label: string) {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function parseLooseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function coerceProviderValue(value: string) {
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return value;
}

export function splitShellList(value: string) {
  return value.trim() ? value.trim().split(/\s+/) : [];
}

export function numberOrUndefined(value: string) {
  return value.trim() ? Number(value) : undefined;
}

export function billingStatusLabel(status: BillingInfo["billingStatus"]) {
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
  if (status === "canceled") return "destructive";
  return "secondary";
}
