CREATE TYPE "notification_channel_provider" AS ENUM('webhook', 'email', 'slack', 'discord');--> statement-breakpoint
CREATE TYPE "scheduled_operation_kind" AS ENUM('tileset_rebuild', 'source_import', 'custom_command');--> statement-breakpoint
CREATE TYPE "scheduled_operation_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "artifact_backup_status" AS ENUM('pending', 'completed', 'failed', 'restored');--> statement-breakpoint
CREATE TYPE "worker_node_kind" AS ENUM('local', 'remote', 'cloud');--> statement-breakpoint
CREATE TYPE "worker_node_status" AS ENUM('pending', 'healthy', 'degraded', 'offline');--> statement-breakpoint
CREATE TYPE "custom_domain_status" AS ENUM('pending', 'verified', 'active', 'failed');--> statement-breakpoint

CREATE TABLE "notification_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "provider" "notification_channel_provider" NOT NULL,
  "target" text NOT NULL,
  "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "encrypted_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "scheduled_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "kind" "scheduled_operation_kind" NOT NULL,
  "status" "scheduled_operation_status" DEFAULT 'active' NOT NULL,
  "cron" varchar(128) NOT NULL,
  "timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "next_run_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "artifact_backups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "storage_object_id" uuid REFERENCES "storage_objects"("id") ON DELETE set null,
  "status" "artifact_backup_status" DEFAULT 'pending' NOT NULL,
  "provider" varchar(32) NOT NULL,
  "bucket" varchar(256) NOT NULL,
  "source_storage_key" text NOT NULL,
  "backup_storage_key" text NOT NULL,
  "size" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "restored_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "worker_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "kind" "worker_node_kind" DEFAULT 'local' NOT NULL,
  "endpoint" text,
  "status" "worker_node_status" DEFAULT 'pending' NOT NULL,
  "validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "preview_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" uuid NOT NULL,
  "slug" varchar(128) NOT NULL,
  "target_url" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "custom_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" uuid,
  "host" varchar(255) NOT NULL,
  "path" varchar(255) DEFAULT '/' NOT NULL,
  "status" "custom_domain_status" DEFAULT 'pending' NOT NULL,
  "verification_token" varchar(128) NOT NULL,
  "tls_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "category" varchar(64) NOT NULL,
  "description" text,
  "template" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "built_in" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX "notification_channels_account_idx" ON "notification_channels" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_channels_account_name_unique" ON "notification_channels" ("account_id","name") WHERE "notification_channels"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduled_operations_account_idx" ON "scheduled_operations" ("account_id");--> statement-breakpoint
CREATE INDEX "scheduled_operations_next_run_idx" ON "scheduled_operations" ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "artifact_backups_account_idx" ON "artifact_backups" ("account_id");--> statement-breakpoint
CREATE INDEX "artifact_backups_storage_object_idx" ON "artifact_backups" ("storage_object_id");--> statement-breakpoint
CREATE INDEX "worker_nodes_account_idx" ON "worker_nodes" ("account_id");--> statement-breakpoint
CREATE INDEX "worker_nodes_status_idx" ON "worker_nodes" ("status");--> statement-breakpoint
CREATE INDEX "preview_links_account_idx" ON "preview_links" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preview_links_slug_unique" ON "preview_links" ("slug") WHERE "preview_links"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "custom_domains_account_idx" ON "custom_domains" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_host_path_unique" ON "custom_domains" ("host","path") WHERE "custom_domains"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workflow_templates_account_idx" ON "workflow_templates" ("account_id");--> statement-breakpoint
CREATE INDEX "workflow_templates_category_idx" ON "workflow_templates" ("category");
