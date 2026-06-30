import { pgEnum } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const accountTypeEnum = pgEnum("account_type", ["USER", "ORGANIZATION"]);
export const accountLifecycleStatusEnum = pgEnum("account_lifecycle_status", [
  "ACTIVE",
  "SUSPENDED",
  "BANNED",
]);
export const systemRoleEnum = pgEnum("system_role", [
  "USER",
  "ADMIN",
  "SUPER",
  "OWNER",
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
export const notificationChannelProviderEnum = pgEnum(
  "notification_channel_provider",
  ["webhook", "email", "slack", "discord"],
);
export const scheduledOperationKindEnum = pgEnum("scheduled_operation_kind", [
  "tileset_rebuild",
  "source_import",
  "custom_command",
]);
export const scheduledOperationStatusEnum = pgEnum(
  "scheduled_operation_status",
  ["active", "paused"],
);
export const artifactBackupStatusEnum = pgEnum("artifact_backup_status", [
  "pending",
  "completed",
  "failed",
  "restored",
]);
export const workerNodeKindEnum = pgEnum("worker_node_kind", [
  "local",
  "remote",
  "cloud",
]);
export const workerNodeStatusEnum = pgEnum("worker_node_status", [
  "pending",
  "healthy",
  "degraded",
  "offline",
]);
export const routingGraphBuildStatusEnum = pgEnum(
  "routing_graph_build_status",
  [
    "queued",
    "assigned",
    "preparing",
    "downloading_source",
    "building_admins",
    "building_tiles",
    "packaging",
    "uploading",
    "succeeded",
    "failed",
    "canceling",
    "canceled",
  ],
);
export const routingGraphArtifactStatusEnum = pgEnum(
  "routing_graph_artifact_status",
  ["pending", "uploading", "available", "failed", "activated"],
);
export const routingGraphActivationStatusEnum = pgEnum(
  "routing_graph_activation_status",
  ["inactive", "activation_requested", "activating", "active", "failed"],
);
export const customDomainStatusEnum = pgEnum("custom_domain_status", [
  "pending",
  "verified",
  "active",
  "failed",
]);
export const billingProviderEnum = pgEnum("billing_provider", ["DODO"]);
export const billingTransactionTypeEnum = pgEnum("billing_transaction_type", [
  "SUBSCRIPTION",
]);
export const billingTransactionStatusEnum = pgEnum(
  "billing_transaction_status",
  [
    "CHECKOUT_CREATED",
    "PENDING",
    "PAID",
    "FAILED",
    "CANCELED",
    "REFUNDED",
    "UNKNOWN",
  ],
);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "INACTIVE",
]);
