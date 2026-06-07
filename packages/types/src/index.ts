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
export type SystemRole = "USER" | "ADMIN" | "SUPER";
export type SourceStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR";
export type SourceType = "VECTOR" | "RASTER" | "GEOJSON" | "IMAGE" | "VIDEO";

// ============================================================================
// Plan definitions
// ============================================================================

export type PlanSlug = "free" | "pro" | "enterprise";
export type PlanId = `prod_${PlanSlug}`;

export interface PlanLimits {
  monthlyUnits: number;
  requestsPerMinute: number;
  maxStyles: number;
  maxSources: number;
  maxApiKeys: number;
}

export interface PlanDefinition extends PlanLimits {
  id: PlanSlug;
  productId: PlanId;
  name: string;
  price: number;
}

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  free: {
    id: "free",
    productId: "prod_free",
    name: "Free",
    price: 0,
    monthlyUnits: 50_000,
    requestsPerMinute: 100,
    maxStyles: 5,
    maxSources: 3,
    maxApiKeys: 5,
  },
  pro: {
    id: "pro",
    productId: "prod_pro",
    name: "Pro",
    price: 29,
    monthlyUnits: 500_000,
    requestsPerMinute: 500,
    maxStyles: 50,
    maxSources: 25,
    maxApiKeys: 25,
  },
  enterprise: {
    id: "enterprise",
    productId: "prod_enterprise",
    name: "Enterprise",
    price: 199,
    monthlyUnits: Infinity,
    requestsPerMinute: 2000,
    maxStyles: Infinity,
    maxSources: Infinity,
    maxApiKeys: Infinity,
  },
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  prod_free: PLANS.free,
  prod_pro: PLANS.pro,
  prod_enterprise: PLANS.enterprise,
};
