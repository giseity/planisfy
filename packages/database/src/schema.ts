import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const systemRoleEnum = pgEnum("system_role", ["USER", "ADMIN", "SUPER"]);
export const memberRoleEnum = pgEnum("member_role", [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "FREE",
  "PRO",
  "ENTERPRISE",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "TRIALING",
  "INACTIVE",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "PENDING",
  "PROCESSING",
  "READY",
  "ERROR",
]);
export const sourceTypeEnum = pgEnum("source_type", [
  "VECTOR",
  "RASTER",
  "GEOJSON",
  "IMAGE",
  "VIDEO",
]);

// ============================================================================
// Profiles (Shared identity layer for users and organizations)
// ============================================================================

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: varchar("handle", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),

    // Billing (attached to the profile, works for both users and orgs)
    plan: subscriptionPlanEnum("plan").default("FREE").notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    subscriptionStatus: subscriptionStatusEnum("subscription_status"),

    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("profiles_handle_unique")
      .on(table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// ============================================================================
// Users (better-auth identity table)
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" })
      .unique(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: systemRoleEnum("role").default("USER").notNull(),
    image: text("image"),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_profile_idx").on(table.profileId),
  ]
);

// ============================================================================
// Organizations
// ============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" })
      .unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("organizations_owner_idx").on(table.ownerId)]
);

// ============================================================================
// Members (User <-> Organization join)
// ============================================================================

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_org_user_unique").on(table.orgId, table.userId),
    index("members_user_idx").on(table.userId),
    index("members_org_idx").on(table.orgId),
  ]
);

// ============================================================================
// better-auth Tables
// ============================================================================

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// Resources (Owned by Profiles — both users and orgs can own resources)
// ============================================================================

export const styles = pgTable(
  "styles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),

    styleJson: jsonb("style_json").notNull(),
    originalStyleJson: jsonb("original_style_json"),

    isPublic: boolean("is_public").notNull().default(false),
    thumbnailUrl: text("thumbnail_url"),
    version: integer("version").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("styles_owner_idx").on(table.ownerId),
    uniqueIndex("styles_owner_handle_unique")
      .on(table.ownerId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 64 }).primaryKey(), // Public Key (pk_...)
    keyHash: varchar("key_hash", { length: 256 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),

    scopes: jsonb("scopes").notNull().default([]),
    allowedDomains: jsonb("allowed_domains").default([]),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_owner_idx").on(table.ownerId),
    index("api_keys_hash_idx").on(table.keyHash),
  ]
);

export const tilesetSources = pgTable(
  "tileset_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),

    type: sourceTypeEnum("type").notNull(),
    url: text("url").notNull(),

    minZoom: integer("min_zoom").default(0),
    maxZoom: integer("max_zoom").default(22),
    bounds: jsonb("bounds"),

    status: sourceStatusEnum("status").default("PENDING"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tileset_sources_owner_idx").on(table.ownerId),
    uniqueIndex("tileset_sources_owner_handle_unique")
      .on(table.ownerId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: varchar("api_key_id", { length: 64 }).references(
      () => apiKeys.id,
      { onDelete: "set null" }
    ),
    profileId: uuid("profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),

    endpoint: varchar("endpoint", { length: 64 }).notNull(),
    method: varchar("method", { length: 8 }).notNull(),
    statusCode: integer("status_code").notNull(),

    cost: integer("cost").default(1),
    ipAddress: text("ip_address"),
    referer: text("referer"),
    userAgent: text("user_agent"),

    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_logs_api_key_idx").on(table.apiKeyId),
    index("usage_logs_profile_idx").on(table.profileId),
    index("usage_logs_timestamp_idx").on(table.timestamp),
  ]
);
