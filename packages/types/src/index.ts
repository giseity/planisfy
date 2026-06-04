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

export type Profile = typeof profiles.$inferSelect;
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
export type ProfileType = AccountType;
export type AccountLifecycleStatus = "ACTIVE" | "SUSPENDED" | "BANNED";
export type SystemRole = "USER" | "ADMIN" | "SUPER";
export type SourceStatus = "PENDING" | "PROCESSING" | "READY" | "ERROR";
export type SourceType = "VECTOR" | "RASTER" | "GEOJSON" | "IMAGE" | "VIDEO";

// ============================================================================
// Plan definitions
// ============================================================================

export type PlanId = "prod_free" | "prod_pro" | "prod_enterprise";

export interface PlanLimits {
  monthlyUnits: number;
  requestsPerMinute: number;
  maxStyles: number;
  maxSources: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  prod_free: {
    monthlyUnits: 50_000,
    requestsPerMinute: 100,
    maxStyles: 5,
    maxSources: 3,
  },
  prod_pro: {
    monthlyUnits: 500_000,
    requestsPerMinute: 500,
    maxStyles: 50,
    maxSources: 25,
  },
  prod_enterprise: {
    monthlyUnits: Infinity,
    requestsPerMinute: 2000,
    maxStyles: Infinity,
    maxSources: Infinity,
  },
};
