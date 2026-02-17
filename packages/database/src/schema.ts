import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  serial,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  varchar,
  foreignKey,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const accountTypeEnum = pgEnum("account_type", ["INDIVIDUAL", "ORGANIZATION"]);
export const accountRoleEnum = pgEnum("account_role", ["USER", "ADMIN", "SUPER"]); // System-level role
export const memberRoleEnum = pgEnum("member_role", ["OWNER", "ADMIN", "MEMBER", "VIEWER"]); // Org-level role
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["FREE", "PRO", "ENTERPRISE"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["ACTIVE", "PAST_DUE", "CANCELED", "TRIALING", "INACTIVE"]);

export const sourceStatusEnum = pgEnum("source_status", ["PENDING", "PROCESSING", "READY", "ERROR"]);
export const sourceTypeEnum = pgEnum("source_type", ["VECTOR", "RASTER", "GEOJSON", "IMAGE", "VIDEO"]);
export const validationStatusEnum = pgEnum("validation_status", ["VALID", "INVALID", "WARNING"]);

export const accessLevelEnum = pgEnum("access_level", ["PRIVATE", "PUBLIC", "ORG_ONLY"]);

// ============================================================================
// Identity & Accounts (Unified Model)
// ============================================================================

export const accounts = pgSchema("public").table(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: accountTypeEnum("type").notNull(), // INDIVIDUAL or ORGANIZATION
    handle: varchar("handle", { length: 64 }).notNull(), // Unique global handle (e.g. @lukas)
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 255 }), // Nullable for Orgs
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),

    // Ownership
    ownerId: uuid("owner_id").notNull(), // Self-reference for Individuals, Creator for Orgs

    // Billing
    plan: subscriptionPlanEnum("plan").default("FREE").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    subscriptionStatus: subscriptionStatusEnum("subscription_status"),

    // Metadata
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("accounts_handle_idx").on(table.handle),
    index("accounts_email_idx").on(table.email),
    index("accounts_owner_idx").on(table.ownerId),
    uniqueIndex("accounts_handle_unique").on(table.handle).where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("accounts_email_unique").on(table.email).where(sql`${table.deletedAt} IS NULL`),
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [table.id],
      name: "accounts_owner_id_fk"
    })
  ]
);

export const members = pgSchema("public").table(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("members_org_user_unique").on(table.orgId, table.userId),
    index("members_user_idx").on(table.userId),
    index("members_org_idx").on(table.orgId),
  ]
);

// Better-Auth Tables (Standard)
export const sessions = pgSchema("public").table("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgSchema("public").table("auth_accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgSchema("public").table("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Resources (Owned by Accounts)
// ============================================================================

export const styles = pgSchema("public").table(
  "styles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(), // URL slug for the style
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),

    // The Style JSON
    styleJson: jsonb("style_json").notNull(),
    originalStyleJson: jsonb("original_style_json"), // For backups/diffs

    // Metadata
    isPublic: boolean("is_public").notNull().default(false),
    thumbnailUrl: text("thumbnail_url"),
    version: integer("version").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("styles_owner_idx").on(table.ownerId),
    uniqueIndex("styles_owner_handle_unique").on(table.ownerId, table.handle).where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const apiKeys = pgSchema("public").table(
  "api_keys",
  {
    id: varchar("id", { length: 64 }).primaryKey(), // Public Key (pk_...)
    keyHash: varchar("key_hash", { length: 256 }).notNull(), // Secret Hash (sk_...) - NEVER STORED PLAINTEXT
    ownerId: uuid("owner_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),

    scopes: jsonb("scopes").notNull().default([]), // ["tiles:read", "styles:write"]
    allowedDomains: jsonb("allowed_domains").default([]), // CORS

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_owner_idx").on(table.ownerId),
    index("api_keys_hash_idx").on(table.keyHash),
  ]
);

export const tilesetSources = pgSchema("public").table(
  "tileset_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),

    type: sourceTypeEnum("type").notNull(),
    url: text("url").notNull(), // S3/R2 URL

    minZoom: integer("min_zoom").default(0),
    maxZoom: integer("max_zoom").default(22),
    bounds: jsonb("bounds"), // [w, s, e, n]

    status: sourceStatusEnum("status").default("PENDING"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tileset_sources_owner_idx").on(table.ownerId),
    uniqueIndex("tileset_sources_owner_handle_unique").on(table.ownerId, table.handle).where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const usageLogs = pgSchema("public").table(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: varchar("api_key_id", { length: 64 }).references(() => apiKeys.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }), // if session based

    endpoint: varchar("endpoint", { length: 64 }).notNull(), // '/tiles/v1'
    method: varchar("method", { length: 8 }).notNull(), // 'GET'
    statusCode: integer("status_code").notNull(),

    cost: integer("cost").default(1), // Credit cost
    ipAddress: text("ip_address"),
    referer: text("referer"),
    userAgent: text("user_agent"),

    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_logs_api_key_idx").on(table.apiKeyId),
    index("usage_logs_account_idx").on(table.accountId),
    index("usage_logs_timestamp_idx").on(table.timestamp),
  ]
);
