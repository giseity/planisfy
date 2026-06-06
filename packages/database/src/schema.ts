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

export const accountTypeEnum = pgEnum("account_type", ["USER", "ORGANIZATION"]);
export const accountLifecycleStatusEnum = pgEnum("account_lifecycle_status", [
  "ACTIVE",
  "SUSPENDED",
  "BANNED",
]);
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
export const sourceProviderEnum = pgEnum("source_provider", [
  "OVERTURE",
  "NATURAL_EARTH",
  "CUSTOM",
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "PENDING",
  "UPLOADED",
  "VALIDATING",
  "READY",
  "ERROR",
]);
export const datasetStatusEnum = pgEnum("dataset_status", [
  "DRAFT",
  "READY",
  "ERROR",
  "ARCHIVED",
]);
export const tilesetStatusEnum = pgEnum("tileset_status", [
  "DRAFT",
  "BUILDING",
  "READY",
  "ERROR",
  "ARCHIVED",
]);
export const tilesetTypeEnum = pgEnum("tileset_type", [
  "VECTOR",
  "RASTER",
  "RASTER_ARRAY",
  "TERRAIN",
]);
export const tileArtifactFormatEnum = pgEnum("tile_artifact_format", [
  "PMTILES",
  "MBTILES",
  "DIRECTORY",
  "EXTERNAL",
]);
export const processingJobStatusEnum = pgEnum("processing_job_status", [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
]);
export const eventStatusEnum = pgEnum("event_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "ARCHIVED",
]);
export const executionTargetProviderEnum = pgEnum("execution_target_provider", [
  "local",
  "aws_batch",
  "gcp_batch",
]);
export const executionTargetAuthModeEnum = pgEnum("execution_target_auth_mode", [
  "federated",
  "static",
  "external",
]);
export const billingProviderEnum = pgEnum("billing_provider", ["DODO"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "TRIALING",
  "INACTIVE",
]);

// ============================================================================
// Accounts (shared identity anchor for users and organizations)
//
// Key design: account.id = user.id (for users)
//             account.id = organization.id (for orgs)
//
// This eliminates extra owner joins: the entity's own ID is the account ID.
// Resources reference accounts.ownerId, so given a user ID or org ID you can
// query resources directly without a join.
// ============================================================================

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: accountTypeEnum("type").notNull(),
    handle: varchar("handle", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    lifecycleStatus: accountLifecycleStatusEnum("lifecycle_status")
      .notNull()
      .default("ACTIVE"),
    lifecycleReason: text("lifecycle_reason"),
    lifecycleUntil: timestamp("lifecycle_until", { withTimezone: true }),
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
    uniqueIndex("accounts_handle_unique")
      .on(table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
    index("accounts_lifecycle_status_idx").on(table.lifecycleStatus),
  ]
);

// Transitional export for alpha callers. New code should import `accounts`.
export const profiles = accounts;

// ============================================================================
// Users (better-auth identity table)
//
// user.id = account.id (shared identity, FK enforced)
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
  (table) => [uniqueIndex("users_email_unique").on(table.email)]
);

// ============================================================================
// Organizations (better-auth org plugin compatible)
//
// organization.id = account.id (shared identity, FK enforced)
// Columns align with the org plugin schema; additional fields (deletedAt)
// are registered via the plugin's schema.organization.additionalFields.
// ============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
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

export const oauthAccounts = pgTable("oauth_accounts", {
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
  ]
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
      table.version
    ),
  ]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 64 }).primaryKey(), // Public ID (pk_...)
    keyHash: varchar("key_hash", { length: 256 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
  ]
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
  ]
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
  ]
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
    profileId: uuid("account_id").references(() => accounts.id, {
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
    index("usage_logs_account_idx").on(table.profileId),
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
    profileId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
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
    index("audit_events_account_idx").on(table.profileId),
    index("audit_events_timestamp_idx").on(table.timestamp),
    index("audit_events_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
  ]
);

// ============================================================================
// Target Resource Model
// ============================================================================

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    originalFileName: varchar("original_file_name", { length: 256 }).notNull(),
    contentType: varchar("content_type", { length: 128 }),
    size: integer("size"),
    storageObjectId: uuid("storage_object_id"),
    status: uploadStatusEnum("status").notNull().default("PENDING"),
    validationResult: jsonb("validation_result"),
    linkedDatasetId: uuid("linked_dataset_id"),
    linkedTilesetId: uuid("linked_tileset_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("uploads_account_idx").on(table.accountId),
    index("uploads_status_idx").on(table.status),
  ]
);

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    status: datasetStatusEnum("status").notNull().default("DRAFT"),
    bounds: jsonb("bounds"),
    featureCount: integer("feature_count"),
    schemaSummary: jsonb("schema_summary"),
    currentVersionId: uuid("current_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("datasets_account_idx").on(table.accountId),
    uniqueIndex("datasets_account_handle_unique")
      .on(table.accountId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storageObjectId: uuid("storage_object_id"),
    bounds: jsonb("bounds"),
    featureCount: integer("feature_count"),
    schemaSummary: jsonb("schema_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dataset_versions_dataset_idx").on(table.datasetId),
    uniqueIndex("dataset_versions_dataset_version_unique").on(
      table.datasetId,
      table.version
    ),
  ]
);

export const sourceImports = pgTable(
  "source_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    sourceConnectionId: uuid("source_connection_id").references(
      () => sourceConnections.id,
      { onDelete: "set null" }
    ),
    regionId: uuid("region_id").references(() => savedRegions.id, {
      onDelete: "set null",
    }),
    datasetId: uuid("dataset_id").references(() => datasets.id, {
      onDelete: "set null",
    }),
    processingJobId: uuid("processing_job_id").references(
      () => processingJobs.id,
      { onDelete: "set null" }
    ),
    provider: sourceProviderEnum("provider").notNull(),
    sourceName: varchar("source_name", { length: 128 }).notNull(),
    status: processingJobStatusEnum("status").notNull().default("PENDING"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("source_imports_account_idx").on(table.accountId),
    index("source_imports_status_idx").on(table.status),
    index("source_imports_dataset_idx").on(table.datasetId),
  ]
);

export const tilesets = pgTable(
  "tilesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    handle: varchar("handle", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    type: tilesetTypeEnum("type").notNull().default("VECTOR"),
    status: tilesetStatusEnum("status").notNull().default("DRAFT"),
    currentVersionId: uuid("current_version_id"),
    bounds: jsonb("bounds"),
    minZoom: integer("min_zoom").default(0),
    maxZoom: integer("max_zoom").default(14),
    layerMetadata: jsonb("layer_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tilesets_account_idx").on(table.accountId),
    uniqueIndex("tilesets_account_handle_unique")
      .on(table.accountId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const tilesetVersions = pgTable(
  "tileset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tilesetId: uuid("tileset_id")
      .notNull()
      .references(() => tilesets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    artifactStorageObjectId: uuid("artifact_storage_object_id"),
    format: tileArtifactFormatEnum("format").notNull().default("PMTILES"),
    buildJobId: uuid("build_job_id"),
    schema: jsonb("schema"),
    bounds: jsonb("bounds"),
    minZoom: integer("min_zoom").default(0),
    maxZoom: integer("max_zoom").default(14),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("tileset_versions_tileset_idx").on(table.tilesetId),
    uniqueIndex("tileset_versions_tileset_version_unique").on(
      table.tilesetId,
      table.version
    ),
  ]
);

export const executionTargets = pgTable(
  "execution_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    provider: executionTargetProviderEnum("provider").notNull().default("local"),
    authMode: executionTargetAuthModeEnum("auth_mode")
      .notNull()
      .default("federated"),
    region: varchar("region", { length: 128 }),
    config: jsonb("config").notNull().default({}),
    encryptedCredentials: jsonb("encrypted_credentials").notNull().default({}),
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
    index("execution_targets_account_idx").on(table.accountId),
    index("execution_targets_provider_idx").on(table.provider),
    uniqueIndex("execution_targets_account_name_unique")
      .on(table.accountId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const executionTargetEnvVars = pgTable(
  "execution_target_env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    executionTargetId: uuid("execution_target_id")
      .notNull()
      .references(() => executionTargets.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    encryptedValue: jsonb("encrypted_value").notNull(),
    isSecret: boolean("is_secret").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("execution_target_env_vars_account_idx").on(table.accountId),
    index("execution_target_env_vars_target_idx").on(table.executionTargetId),
    uniqueIndex("execution_target_env_vars_target_name_unique")
      .on(table.executionTargetId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const workerProfiles = pgTable(
  "worker_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    image: text("image"),
    command: jsonb("command").notNull().default([]),
    args: jsonb("args").notNull().default([]),
    cpu: integer("cpu"),
    memoryMb: integer("memory_mb"),
    timeoutSeconds: integer("timeout_seconds"),
    concurrency: integer("concurrency"),
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
    index("worker_profiles_account_idx").on(table.accountId),
    uniqueIndex("worker_profiles_account_name_unique")
      .on(table.accountId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const stylePublications = pgTable(
  "style_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    styleId: uuid("style_id")
      .notNull()
      .references(() => styles.id, { onDelete: "cascade" }),
    styleVersionId: uuid("style_version_id")
      .notNull()
      .references(() => styleVersions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    alias: varchar("alias", { length: 64 }).notNull().default("latest"),
    publishedBy: uuid("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("style_publications_style_idx").on(table.styleId),
    uniqueIndex("style_publications_style_alias_unique").on(
      table.styleId,
      table.alias
    ),
  ]
);

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    status: processingJobStatusEnum("status").notNull().default("PENDING"),
    progress: integer("progress").notNull().default(0),
    executionTargetId: uuid("execution_target_id").references(
      () => executionTargets.id,
      { onDelete: "set null" }
    ),
    workerProfileId: uuid("worker_profile_id").references(
      () => workerProfiles.id,
      { onDelete: "set null" }
    ),
    input: jsonb("input"),
    output: jsonb("output"),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("processing_jobs_account_idx").on(table.accountId),
    index("processing_jobs_status_idx").on(table.status),
    index("processing_jobs_execution_target_idx").on(table.executionTargetId),
    index("processing_jobs_worker_profile_idx").on(table.workerProfileId),
  ]
);

export const processingJobLogs = pgTable(
  "processing_job_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => processingJobs.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 16 }).notNull().default("info"),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("processing_job_logs_job_idx").on(table.jobId)]
);

export const eventOutbox = pgTable(
  "event_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventName: varchar("event_name", { length: 128 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: eventStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    processAt: timestamp("process_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("event_outbox_next_event_idx").on(table.status, table.processAt),
    index("event_outbox_event_name_idx").on(table.eventName),
  ]
);

export const storageObjects = pgTable(
  "storage_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 32 }).notNull().default("local"),
    bucket: varchar("bucket", { length: 256 }).notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: varchar("file_name", { length: 256 }),
    contentType: varchar("content_type", { length: 128 }),
    size: integer("size"),
    contentHash: varchar("content_hash", { length: 128 }),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceId: uuid("resource_id"),
    artifactKind: varchar("artifact_kind", { length: 64 }),
    version: varchar("version", { length: 64 }),
    metadata: jsonb("metadata"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("storage_objects_account_idx").on(table.accountId),
    index("storage_objects_resource_idx").on(
      table.resourceType,
      table.resourceId
    ),
    uniqueIndex("storage_objects_key_unique")
      .on(table.provider, table.bucket, table.storageKey)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export const basemapReleases = pgTable(
  "basemap_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 128 }).notNull(),
    version: varchar("version", { length: 64 }).notNull(),
    status: processingJobStatusEnum("status").notNull().default("PENDING"),
    sourceDataVersions: jsonb("source_data_versions"),
    schemaVersion: varchar("schema_version", { length: 64 }),
    artifactStorageObjectId: uuid("artifact_storage_object_id"),
    manifestStorageObjectId: uuid("manifest_storage_object_id"),
    bounds: jsonb("bounds"),
    minZoom: integer("min_zoom").default(0),
    maxZoom: integer("max_zoom").default(14),
    attribution: text("attribution"),
    buildJobId: uuid("build_job_id").references(() => processingJobs.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("basemap_releases_name_version_unique").on(
      table.name,
      table.version
    ),
  ]
);

export const usageRollups = pgTable(
  "usage_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    endpoint: varchar("endpoint", { length: 64 }),
    units: integer("units").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_rollups_account_period_idx").on(
      table.accountId,
      table.periodStart
    ),
  ]
);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: billingProviderEnum("provider").notNull().default("DODO"),
    providerCustomerId: text("provider_customer_id").notNull(),
    email: text("email"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("billing_customers_account_provider_unique").on(
      table.accountId,
      table.provider
    ),
    uniqueIndex("billing_customers_provider_id_unique").on(
      table.provider,
      table.providerCustomerId
    ),
  ]
);

export const plans = pgTable("plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  limits: jsonb("limits").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 64 })
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("INACTIVE"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    providerSubscriptionId: text("provider_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("subscriptions_account_idx").on(table.accountId),
    index("subscriptions_status_idx").on(table.status),
  ]
);

export const billingTransactions = pgTable(
  "billing_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: billingProviderEnum("provider").notNull().default("DODO"),
    status: varchar("status", { length: 64 }).notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    providerOrderId: text("provider_order_id"),
    providerCustomerId: text("provider_customer_id"),
    amountCents: integer("amount_cents"),
    currency: varchar("currency", { length: 8 }),
    metadata: jsonb("metadata"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("billing_transactions_account_idx").on(table.accountId),
    uniqueIndex("billing_transactions_checkout_unique").on(
      table.provider,
      table.providerCheckoutId
    ),
    uniqueIndex("billing_transactions_order_unique").on(
      table.provider,
      table.providerOrderId
    ),
  ]
);
