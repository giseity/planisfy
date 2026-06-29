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
import {
  savedRegions,
  sourceConnections,
  styles,
  styleVersions,
} from "./resources";
import {
  artifactBackupStatusEnum,
  customDomainStatusEnum,
  datasetStatusEnum,
  eventStatusEnum,
  executionTargetAuthModeEnum,
  executionTargetProviderEnum,
  notificationChannelProviderEnum,
  processingJobStatusEnum,
  routingGraphActivationStatusEnum,
  routingGraphArtifactStatusEnum,
  routingGraphBuildStatusEnum,
  scheduledOperationKindEnum,
  scheduledOperationStatusEnum,
  sourceProviderEnum,
  tileArtifactFormatEnum,
  tilesetStatusEnum,
  tilesetTypeEnum,
  uploadStatusEnum,
  workerNodeKindEnum,
  workerNodeStatusEnum,
} from "./primitives";

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
  ],
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
  ],
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
      table.version,
    ),
  ],
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
      { onDelete: "set null" },
    ),
    regionId: uuid("region_id").references(() => savedRegions.id, {
      onDelete: "set null",
    }),
    datasetId: uuid("dataset_id").references(() => datasets.id, {
      onDelete: "set null",
    }),
    targetTilesetId: uuid("target_tileset_id").references(() => tilesets.id, {
      onDelete: "set null",
    }),
    processingJobId: uuid("processing_job_id").references(
      () => processingJobs.id,
      { onDelete: "set null" },
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
    index("source_imports_target_tileset_idx").on(table.targetTilesetId),
  ],
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
    buildJobId: uuid("build_job_id").references(() => processingJobs.id, {
      onDelete: "set null",
    }),
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
    index("tilesets_build_job_idx").on(table.buildJobId),
    uniqueIndex("tilesets_account_handle_unique")
      .on(table.accountId, table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
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
      table.version,
    ),
  ],
);

export const executionTargets = pgTable(
  "execution_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    provider: executionTargetProviderEnum("provider")
      .notNull()
      .default("local"),
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
  ],
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
  ],
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
  ],
);

export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    provider: notificationChannelProviderEnum("provider").notNull(),
    target: text("target").notNull(),
    events: jsonb("events").notNull().default([]),
    encryptedConfig: jsonb("encrypted_config").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("notification_channels_account_idx").on(table.accountId),
    uniqueIndex("notification_channels_account_name_unique")
      .on(table.accountId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const scheduledOperations = pgTable(
  "scheduled_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    kind: scheduledOperationKindEnum("kind").notNull(),
    status: scheduledOperationStatusEnum("status").notNull().default("active"),
    cron: varchar("cron", { length: 128 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    payload: jsonb("payload").notNull().default({}),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("scheduled_operations_account_idx").on(table.accountId),
    index("scheduled_operations_next_run_idx").on(
      table.status,
      table.nextRunAt,
    ),
  ],
);

export const artifactBackups = pgTable(
  "artifact_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "set null" },
    ),
    status: artifactBackupStatusEnum("status").notNull().default("pending"),
    provider: varchar("provider", { length: 32 }).notNull(),
    bucket: varchar("bucket", { length: 256 }).notNull(),
    sourceStorageKey: text("source_storage_key").notNull(),
    backupStorageKey: text("backup_storage_key").notNull(),
    size: integer("size"),
    metadata: jsonb("metadata").notNull().default({}),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
  },
  (table) => [
    index("artifact_backups_account_idx").on(table.accountId),
    index("artifact_backups_storage_object_idx").on(table.storageObjectId),
  ],
);

export const workerNodes = pgTable(
  "worker_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 128 }).notNull(),
    kind: workerNodeKindEnum("kind").notNull().default("local"),
    endpoint: text("endpoint"),
    status: workerNodeStatusEnum("status").notNull().default("pending"),
    validation: jsonb("validation").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("worker_nodes_account_idx").on(table.accountId),
    index("worker_nodes_status_idx").on(table.status),
  ],
);

export const rootAgentRegistrationTokens = pgTable(
  "root_agent_registration_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    kind: workerNodeKindEnum("kind").notNull().default("remote"),
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdWorkerNodeId: uuid("created_worker_node_id").references(
      () => workerNodes.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("root_agent_registration_tokens_account_idx").on(table.accountId),
    uniqueIndex("root_agent_registration_tokens_hash_unique").on(
      table.tokenHash,
    ),
  ],
);

export const rootAgentNodeTokens = pgTable(
  "root_agent_node_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    workerNodeId: uuid("worker_node_id")
      .notNull()
      .references(() => workerNodes.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("root_agent_node_tokens_worker_idx").on(table.workerNodeId),
    uniqueIndex("root_agent_node_tokens_hash_unique").on(table.tokenHash),
  ],
);

export const routingGraphBuilds = pgTable(
  "routing_graph_builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    status: routingGraphBuildStatusEnum("status").notNull().default("queued"),
    activationStatus: routingGraphActivationStatusEnum("activation_status")
      .notNull()
      .default("inactive"),
    progress: integer("progress").notNull().default(0),
    workerNodeId: uuid("worker_node_id").references(() => workerNodes.id, {
      onDelete: "set null",
    }),
    activationWorkerNodeId: uuid("activation_worker_node_id").references(
      () => workerNodes.id,
      { onDelete: "set null" },
    ),
    sourceUrl: text("source_url").notNull(),
    sourcePreset: varchar("source_preset", { length: 128 }),
    valhallaImage: text("valhalla_image").notNull(),
    includeAdmins: boolean("include_admins").notNull().default(true),
    includeTimezones: boolean("include_timezones").notNull().default(true),
    elevationMode: varchar("elevation_mode", { length: 64 })
      .notNull()
      .default("none"),
    config: jsonb("config").notNull().default({}),
    output: jsonb("output").notNull().default({}),
    errorCode: varchar("error_code", { length: 128 }),
    errorMessage: text("error_message"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("routing_graph_builds_account_idx").on(table.accountId),
    index("routing_graph_builds_status_idx").on(table.status),
    index("routing_graph_builds_worker_idx").on(table.workerNodeId),
  ],
);

export const routingGraphBuildLogs = pgTable(
  "routing_graph_build_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildId: uuid("build_id")
      .notNull()
      .references(() => routingGraphBuilds.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 16 }).notNull().default("info"),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("routing_graph_build_logs_build_idx").on(table.buildId)],
);

export const previewLinks = pgTable(
  "preview_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    targetUrl: text("target_url").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("preview_links_account_idx").on(table.accountId),
    uniqueIndex("preview_links_slug_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const customDomains = pgTable(
  "custom_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: uuid("resource_id"),
    host: varchar("host", { length: 255 }).notNull(),
    path: varchar("path", { length: 255 }).notNull().default("/"),
    status: customDomainStatusEnum("status").notNull().default("pending"),
    verificationToken: varchar("verification_token", { length: 128 }).notNull(),
    tlsEnabled: boolean("tls_enabled").notNull().default(true),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("custom_domains_account_idx").on(table.accountId),
    uniqueIndex("custom_domains_host_path_unique")
      .on(table.host, table.path)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 128 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    description: text(),
    template: jsonb("template").notNull().default({}),
    builtIn: boolean("built_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_templates_account_idx").on(table.accountId),
    index("workflow_templates_category_idx").on(table.category),
  ],
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
      table.alias,
    ),
  ],
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
      { onDelete: "set null" },
    ),
    workerProfileId: uuid("worker_profile_id").references(
      () => workerProfiles.id,
      { onDelete: "set null" },
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
  ],
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
  (table) => [index("processing_job_logs_job_idx").on(table.jobId)],
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
  ],
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
      table.resourceId,
    ),
    uniqueIndex("storage_objects_key_unique")
      .on(table.provider, table.bucket, table.storageKey)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const routingGraphArtifacts = pgTable(
  "routing_graph_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    buildId: uuid("build_id")
      .notNull()
      .references(() => routingGraphBuilds.id, { onDelete: "cascade" }),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "set null" },
    ),
    kind: varchar("kind", { length: 64 }).notNull().default("valhalla_graph"),
    status: routingGraphArtifactStatusEnum("status")
      .notNull()
      .default("pending"),
    fileName: varchar("file_name", { length: 256 }).notNull(),
    size: integer("size"),
    checksumSha256: varchar("checksum_sha256", { length: 128 }),
    manifest: jsonb("manifest").notNull().default({}),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("routing_graph_artifacts_account_idx").on(table.accountId),
    index("routing_graph_artifacts_build_idx").on(table.buildId),
  ],
);

export const spriteAssets = pgTable(
  "sprite_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 96 }).notNull(),
    folder: varchar("folder", { length: 128 }).notNull().default(""),
    description: text("description"),
    sourceFormat: varchar("source_format", { length: 16 }).notNull().default("png"),
    storageObjectId: uuid("storage_object_id")
      .notNull()
      .references(() => storageObjects.id, { onDelete: "restrict" }),
    rasterStorageObjectId: uuid("raster_storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("sprite_assets_account_idx").on(table.accountId),
    index("sprite_assets_storage_object_idx").on(table.storageObjectId),
    index("sprite_assets_raster_storage_object_idx").on(
      table.rasterStorageObjectId,
    ),
    index("sprite_assets_account_folder_idx").on(table.accountId, table.folder),
    uniqueIndex("sprite_assets_account_name_unique")
      .on(table.accountId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
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
      table.version,
    ),
  ],
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
      table.periodStart,
    ),
  ],
);
