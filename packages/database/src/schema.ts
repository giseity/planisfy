import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const profileTypeEnum = pgEnum("profile_type", ["USER", "ORGANIZATION"]);
export const systemRoleEnum = pgEnum("system_role", ["USER", "ADMIN", "SUPER"]);

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
// Profiles (Shared identity — supertype for users and organizations)
//
// Key design: profile.id = user.id (for users)
//             profile.id = organization.id (for orgs)
//
// This eliminates the profileId FK — the entity's own ID *is* the profile ID.
// Resources reference profiles.ownerId, so given a user ID or org ID you can
// query resources directly without a join.
// ============================================================================

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: profileTypeEnum("type").notNull(),
    handle: varchar("handle", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
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
//
// user.id = profile.id (shared identity, FK enforced)
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: systemRoleEnum("role").default("USER").notNull(),
    image: text("image"),
    name: varchar("name", { length: 128 }).notNull(),
    polarCustomerId: varchar("polar_customer_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)]
);

// ============================================================================
// Organizations (better-auth org plugin compatible)
//
// organization.id = profile.id (shared identity, FK enforced)
// Columns align with the org plugin schema; additional fields (deletedAt)
// are registered via the plugin's schema.organization.additionalFields.
// ============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    logo: text("logo"),
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
    uniqueIndex("organizations_slug_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// ============================================================================
// Members (better-auth org plugin — User <-> Organization join)
//
// Role is a plain string to align with the org plugin's access control system.
// Default roles: "owner", "admin", "member". Custom roles (e.g. "viewer")
// can be defined in the plugin configuration.
// ============================================================================

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_org_user_unique").on(
      table.organizationId,
      table.userId
    ),
    index("members_user_idx").on(table.userId),
    index("members_org_idx").on(table.organizationId),
  ]
);

// ============================================================================
// Invitations (better-auth org plugin)
// ============================================================================

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 32 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invitations_org_idx").on(table.organizationId),
    index("invitations_email_idx").on(table.email),
  ]
);

// ============================================================================
// better-auth Core Tables
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
  activeOrganizationId: uuid("active_organization_id"),
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
    id: varchar("id", { length: 64 }).primaryKey(), // Public ID (pk_...)
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
    index("api_keys_scopes_idx").using("gin", table.scopes),
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

// ============================================================================
// Audit Events (Core actions: *.created, *.updated, *.deleted)
// ============================================================================

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 32 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_profile_idx").on(table.profileId),
    index("audit_events_timestamp_idx").on(table.timestamp),
    index("audit_events_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
  ]
);
