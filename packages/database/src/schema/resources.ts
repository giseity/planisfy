import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { accounts, users } from "./identity";
import { sourceProviderEnum, sourceStatusEnum, sourceTypeEnum } from "./primitives";

// ============================================================================
// Resources (owned by accounts: both users and orgs can own resources)
// ============================================================================

export const styles = pgTable(
  "styles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
  ],
);

export const styleVersions = pgTable(
  "style_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    styleId: uuid("style_id")
      .notNull()
      .references(() => styles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    styleJson: jsonb("style_json").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("style_versions_style_idx").on(table.styleId),
    uniqueIndex("style_versions_style_version_unique").on(
      table.styleId,
      table.version,
    ),
  ],
);

export const apiKeys = pgTable(
  "apikey",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    configId: varchar("config_id", { length: 64 }).notNull().default("default"),
    name: varchar("name", { length: 128 }),
    start: varchar("start", { length: 32 }),
    prefix: varchar("prefix", { length: 32 }),
    key: varchar("key", { length: 256 }).notNull(),
    referenceId: uuid("reference_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(false),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_config_id_idx").on(table.configId),
    index("apikey_reference_id_idx").on(table.referenceId),
    index("apikey_key_idx").on(table.key),
  ],
);

export const tilesetSources = pgTable(
  "tileset_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
  ],
);

export const sourceCredentials = pgTable(
  "source_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    provider: sourceProviderEnum("provider").notNull(),
    encryptedPayload: jsonb("encrypted_payload").notNull().default({}),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("source_credentials_account_idx").on(table.accountId),
    uniqueIndex("source_credentials_account_name_unique")
      .on(table.accountId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const savedRegions = pgTable(
  "saved_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    geometry: jsonb("geometry"),
    bbox: jsonb("bbox").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("saved_regions_account_idx").on(table.accountId),
    uniqueIndex("saved_regions_account_handle_unique")
      .on(table.accountId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const sourceConnections = pgTable(
  "source_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    provider: sourceProviderEnum("provider").notNull(),
    url: text("url"),
    credentialId: uuid("credential_id").references(() => sourceCredentials.id, {
      onDelete: "set null",
    }),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("source_connections_account_idx").on(table.accountId),
    uniqueIndex("source_connections_account_handle_unique")
      .on(table.accountId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: varchar("api_key_id", { length: 64 }).references(
      () => apiKeys.id,
      { onDelete: "set null" },
    ),
    profileId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),

    endpoint: varchar("endpoint", { length: 64 }).notNull(),
    method: varchar("method", { length: 8 }).notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms"),

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
    index("usage_logs_account_idx").on(table.profileId),
    index("usage_logs_timestamp_idx").on(table.timestamp),
  ],
);
