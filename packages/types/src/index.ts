import type {
  accounts,
  profiles,
  users,
  organizations,
  members,
  styles,
  apiKeys,
  tilesetSources,
  usageLogs,
  auditEvents,
} from "@planisfy/database";

// ============================================================================
// Drizzle inferred row types
// ============================================================================

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

/** @deprecated Use Account. `profiles` is a compatibility alias for `accounts`. */
export type Profile = typeof profiles.$inferSelect;
/** @deprecated Use NewAccount. `profiles` is a compatibility alias for `accounts`. */
export type NewProfile = typeof profiles.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type Style = typeof styles.$inferSelect;
export type NewStyle = typeof styles.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type TilesetSource = typeof tilesetSources.$inferSelect;
export type NewTilesetSource = typeof tilesetSources.$inferInsert;

export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;

// ============================================================================
// Enum value types
// ============================================================================

export type AccountType = "USER" | "ORGANIZATION";
/** @deprecated Use AccountType. */
export type ProfileType = AccountType;
export type AccountLifecycleStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
export type SystemRole = "USER" | "ADMIN" | "SUPER" | "OWNER";
export type SourceStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR";
export type SourceType = "VECTOR" | "RASTER" | "GEOJSON" | "IMAGE" | "VIDEO";

// ============================================================================
// Plan definitions
// ============================================================================

export type PlanSlug = "free" | "starter" | "scale" | "platform";
export type LegacyPlanSlug = "pro" | "enterprise";
export type AnyPlanSlug = PlanSlug | LegacyPlanSlug;
export type PlanId = `prod_${PlanSlug}`;
export type CheckoutPlanSlug = "starter" | "scale";
export type BillingInterval = "monthly" | "yearly";

export type PlanFeature =
  | "team"
  | "audit"
  | "operations"
  | "routingBuilds"
  | "externalRootAgents"
  | "planetScaleBuilds"
  | "selfHostSupport"
  | "sla"
  | "onboarding";

export interface PlanLimits {
  monthlyUnits: number;
  requestsPerMinute: number;
  maxStyles: number;
  maxSources: number;
  maxApiKeys: number;
}

export interface PlanPrice {
  interval: BillingInterval;
  price: number;
  priceLabel: string;
  period: string;
}

export interface PlanDefinition extends PlanLimits {
  id: PlanSlug;
  productId: PlanId;
  name: string;
  price: number;
  priceLabel: string;
  period: string;
  description: string;
  cta: string;
  highlighted: boolean;
  checkout: boolean;
  pricing: Partial<Record<BillingInterval, PlanPrice>>;
  features: string[];
  entitlements: PlanFeature[];
  comparison: {
    publishedStyles: string;
    hostedTilesets: string;
    apiKeys: string;
    geocodingUsage: string;
    usageDashboard: boolean;
    teamRoles: boolean;
    auditLog: boolean;
    operationsControls: boolean;
    selfHostSupport: boolean;
    slaAndOnboarding: boolean;
  };
}

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  free: {
    id: "free",
    productId: "prod_free",
    name: "Free",
    price: 0,
    priceLabel: "$0",
    period: "/month",
    description: "For personal projects, prototypes, and integration testing.",
    cta: "Create account",
    highlighted: false,
    checkout: false,
    pricing: {
      monthly: {
        interval: "monthly",
        price: 0,
        priceLabel: "$0",
        period: "/month",
      },
    },
    monthlyUnits: 100_000,
    requestsPerMinute: 100,
    maxStyles: 3,
    maxSources: 1,
    maxApiKeys: 2,
    features: [
      "Hosted style publishing",
      "One hosted tileset",
      "Two scoped API keys",
      "100k Planisfy credits/month",
    ],
    entitlements: [],
    comparison: {
      publishedStyles: "3",
      hostedTilesets: "1",
      apiKeys: "2",
      geocodingUsage: "100k credits",
      usageDashboard: true,
      teamRoles: false,
      auditLog: false,
      operationsControls: false,
      selfHostSupport: false,
      slaAndOnboarding: false,
    },
  },
  starter: {
    id: "starter",
    productId: "prod_starter",
    name: "Starter",
    price: 29,
    priceLabel: "$29",
    period: "/month",
    description: "For small production apps and teams moving maps into use.",
    cta: "Start starter plan",
    highlighted: true,
    checkout: true,
    pricing: {
      monthly: {
        interval: "monthly",
        price: 29,
        priceLabel: "$29",
        period: "/month",
      },
      yearly: {
        interval: "yearly",
        price: 290,
        priceLabel: "$290",
        period: "/year",
      },
    },
    monthlyUnits: 1_000_000,
    requestsPerMinute: 500,
    maxStyles: 10,
    maxSources: 5,
    maxApiKeys: 10,
    features: [
      "1m Planisfy credits/month",
      "Team collaboration",
      "Multiple API keys",
      "Usage visibility",
      "Email support",
    ],
    entitlements: ["team"],
    comparison: {
      publishedStyles: "10",
      hostedTilesets: "5",
      apiKeys: "10",
      geocodingUsage: "1m credits",
      usageDashboard: true,
      teamRoles: true,
      auditLog: false,
      operationsControls: false,
      selfHostSupport: false,
      slaAndOnboarding: false,
    },
  },
  scale: {
    id: "scale",
    productId: "prod_scale",
    name: "Scale",
    price: 99,
    priceLabel: "$99",
    period: "/month",
    description: "For production teams needing governance and operations.",
    cta: "Start scale plan",
    highlighted: false,
    checkout: true,
    pricing: {
      monthly: {
        interval: "monthly",
        price: 99,
        priceLabel: "$99",
        period: "/month",
      },
      yearly: {
        interval: "yearly",
        price: 990,
        priceLabel: "$990",
        period: "/year",
      },
    },
    monthlyUnits: 8_000_000,
    requestsPerMinute: 1500,
    maxStyles: 50,
    maxSources: 20,
    maxApiKeys: 40,
    features: [
      "8m Planisfy credits/month",
      "Audit log",
      "Operations controls",
      "Regional routing graph builds",
      "Advanced usage controls",
      "Priority operations review",
    ],
    entitlements: ["team", "audit", "operations", "routingBuilds"],
    comparison: {
      publishedStyles: "50",
      hostedTilesets: "20",
      apiKeys: "40",
      geocodingUsage: "8m credits",
      usageDashboard: true,
      teamRoles: true,
      auditLog: true,
      operationsControls: true,
      selfHostSupport: false,
      slaAndOnboarding: false,
    },
  },
  platform: {
    id: "platform",
    productId: "prod_platform",
    name: "Platform",
    price: 0,
    priceLabel: "Custom",
    period: "",
    description: "For organizations that need scale and deployment control.",
    cta: "Talk to sales",
    highlighted: false,
    checkout: false,
    pricing: {},
    monthlyUnits: Infinity,
    requestsPerMinute: Infinity,
    maxStyles: Infinity,
    maxSources: Infinity,
    maxApiKeys: Infinity,
    features: [
      "Custom Planisfy credit quota",
      "Self-hosting support",
      "Planet routing builds",
      "External root-agent compute",
      "Custom storage topology",
      "SLA and onboarding",
      "Operational readiness review",
    ],
    entitlements: [
      "team",
      "audit",
      "operations",
      "routingBuilds",
      "externalRootAgents",
      "planetScaleBuilds",
      "selfHostSupport",
      "sla",
      "onboarding",
    ],
    comparison: {
      publishedStyles: "Custom",
      hostedTilesets: "Custom",
      apiKeys: "Custom",
      geocodingUsage: "Custom",
      usageDashboard: true,
      teamRoles: true,
      auditLog: true,
      operationsControls: true,
      selfHostSupport: true,
      slaAndOnboarding: true,
    },
  },
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  prod_free: PLANS.free,
  prod_starter: PLANS.starter,
  prod_scale: PLANS.scale,
  prod_platform: PLANS.platform,
};

export const PLAN_ORDER = ["free", "starter", "scale", "platform"] as const;

export const LEGACY_PLAN_SLUGS = {
  pro: "starter",
  enterprise: "scale",
} satisfies Record<LegacyPlanSlug, PlanSlug>;

export function normalizePlanSlug(value: unknown): PlanSlug | null {
  if (value === "free" || value === "starter" || value === "scale" || value === "platform") {
    return value;
  }
  if (value === "pro" || value === "enterprise") {
    return LEGACY_PLAN_SLUGS[value];
  }
  return null;
}

export function planIncludesFeature(planId: PlanSlug, feature: PlanFeature) {
  return PLANS[planId].entitlements.includes(feature);
}
