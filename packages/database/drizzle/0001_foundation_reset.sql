DROP TABLE IF EXISTS "billing_transactions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "plans" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "billing_customers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "usage_rollups" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "basemap_releases" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "storage_objects" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "event_outbox" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "processing_job_logs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "processing_jobs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "style_publications" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tileset_versions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tilesets" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "dataset_versions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "datasets" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "uploads" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "usage_logs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tileset_sources" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "api_keys" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "audit_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "style_versions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "styles" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verifications" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "oauth_accounts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "accounts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "invitations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "members" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "organizations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "profiles" CASCADE;--> statement-breakpoint

DROP TYPE IF EXISTS "account_lifecycle_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "account_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "billing_provider" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "billing_transaction_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "billing_transaction_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "dataset_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "event_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "processing_job_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "subscription_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "tile_artifact_format" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "tileset_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "tileset_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "upload_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "profile_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "source_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "source_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "system_role" CASCADE;--> statement-breakpoint

CREATE TYPE "account_type" AS ENUM('USER', 'ORGANIZATION');--> statement-breakpoint
CREATE TYPE "account_lifecycle_status" AS ENUM('ACTIVE', 'SUSPENDED', 'BANNED');--> statement-breakpoint
CREATE TYPE "system_role" AS ENUM('USER', 'ADMIN', 'SUPER');--> statement-breakpoint
CREATE TYPE "source_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'ERROR');--> statement-breakpoint
CREATE TYPE "source_type" AS ENUM('VECTOR', 'RASTER', 'GEOJSON', 'IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "upload_status" AS ENUM('PENDING', 'UPLOADED', 'VALIDATING', 'READY', 'ERROR');--> statement-breakpoint
CREATE TYPE "dataset_status" AS ENUM('DRAFT', 'READY', 'ERROR', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "tileset_status" AS ENUM('DRAFT', 'BUILDING', 'READY', 'ERROR', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "tileset_type" AS ENUM('VECTOR', 'RASTER', 'RASTER_ARRAY', 'TERRAIN');--> statement-breakpoint
CREATE TYPE "tile_artifact_format" AS ENUM('PMTILES', 'MBTILES', 'DIRECTORY', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "processing_job_status" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "event_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "billing_provider" AS ENUM('DODO');--> statement-breakpoint
CREATE TYPE "billing_transaction_type" AS ENUM('SUBSCRIPTION');--> statement-breakpoint
CREATE TYPE "billing_transaction_status" AS ENUM('CHECKOUT_CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELED', 'INACTIVE');--> statement-breakpoint

CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "account_type" NOT NULL,
  "handle" varchar(64) NOT NULL,
  "display_name" varchar(128) NOT NULL,
  "avatar_url" text,
  "bio" text,
  "lifecycle_status" "account_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
  "lifecycle_reason" text,
  "lifecycle_until" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "email" varchar(255) NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "role" "system_role" DEFAULT 'USER' NOT NULL,
  "image" text,
  "name" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "slug" varchar(128) NOT NULL,
  "logo" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" varchar(32) DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "email" varchar(255) NOT NULL,
  "role" varchar(32),
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "active_organization_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "oauth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "expires_at" timestamp with time zone,
  "password" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "styles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "style_json" jsonb NOT NULL,
  "original_style_json" jsonb,
  "is_public" boolean DEFAULT false NOT NULL,
  "thumbnail_url" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "style_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "style_id" uuid NOT NULL REFERENCES "styles"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "style_json" jsonb NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "api_keys" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "key_hash" varchar(256) NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_domains" jsonb DEFAULT '[]'::jsonb,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "tileset_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "type" "source_type" NOT NULL,
  "url" text NOT NULL,
  "min_zoom" integer DEFAULT 0,
  "max_zoom" integer DEFAULT 22,
  "bounds" jsonb,
  "status" "source_status" DEFAULT 'PENDING',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "usage_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" varchar(64) REFERENCES "api_keys"("id") ON DELETE set null,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "endpoint" varchar(64) NOT NULL,
  "method" varchar(8) NOT NULL,
  "status_code" integer NOT NULL,
  "cost" integer DEFAULT 1,
  "ip_address" text,
  "referer" text,
  "user_agent" text,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "action" varchar(64) NOT NULL,
  "resource_type" varchar(32) NOT NULL,
  "resource_id" varchar(128),
  "metadata" jsonb,
  "ip_address" text,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "original_file_name" varchar(256) NOT NULL,
  "content_type" varchar(128),
  "size" integer,
  "storage_object_id" uuid,
  "status" "upload_status" DEFAULT 'PENDING' NOT NULL,
  "validation_result" jsonb,
  "linked_dataset_id" uuid,
  "linked_tileset_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "status" "dataset_status" DEFAULT 'DRAFT' NOT NULL,
  "bounds" jsonb,
  "feature_count" integer,
  "schema_summary" jsonb,
  "current_version_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "dataset_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dataset_id" uuid NOT NULL REFERENCES "datasets"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "storage_object_id" uuid,
  "bounds" jsonb,
  "feature_count" integer,
  "schema_summary" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "tilesets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "type" "tileset_type" DEFAULT 'VECTOR' NOT NULL,
  "status" "tileset_status" DEFAULT 'DRAFT' NOT NULL,
  "current_version_id" uuid,
  "bounds" jsonb,
  "min_zoom" integer DEFAULT 0,
  "max_zoom" integer DEFAULT 14,
  "layer_metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "tileset_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tileset_id" uuid NOT NULL REFERENCES "tilesets"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "artifact_storage_object_id" uuid,
  "format" "tile_artifact_format" DEFAULT 'PMTILES' NOT NULL,
  "build_job_id" uuid,
  "schema" jsonb,
  "bounds" jsonb,
  "min_zoom" integer DEFAULT 0,
  "max_zoom" integer DEFAULT 14,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "style_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "style_id" uuid NOT NULL REFERENCES "styles"("id") ON DELETE cascade,
  "style_version_id" uuid NOT NULL REFERENCES "style_versions"("id") ON DELETE cascade,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "alias" varchar(64) DEFAULT 'latest' NOT NULL,
  "published_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "type" varchar(64) NOT NULL,
  "status" "processing_job_status" DEFAULT 'PENDING' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error_code" varchar(128),
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "cancel_requested_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "processing_job_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "processing_jobs"("id") ON DELETE cascade,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "event_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_name" varchar(128) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" "event_status" DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "process_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "storage_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "provider" varchar(32) DEFAULT 'local' NOT NULL,
  "bucket" varchar(256) NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" varchar(256),
  "content_type" varchar(128),
  "size" integer,
  "content_hash" varchar(128),
  "resource_type" varchar(64),
  "resource_id" uuid,
  "artifact_kind" varchar(64),
  "version" varchar(64),
  "metadata" jsonb,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "basemap_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "version" varchar(64) NOT NULL,
  "status" "processing_job_status" DEFAULT 'PENDING' NOT NULL,
  "source_data_versions" jsonb,
  "schema_version" varchar(64),
  "artifact_storage_object_id" uuid,
  "manifest_storage_object_id" uuid,
  "bounds" jsonb,
  "min_zoom" integer DEFAULT 0,
  "max_zoom" integer DEFAULT 14,
  "attribution" text,
  "build_job_id" uuid REFERENCES "processing_jobs"("id") ON DELETE set null,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "usage_rollups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "endpoint" varchar(64),
  "units" integer DEFAULT 0 NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "billing_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "provider" "billing_provider" DEFAULT 'DODO' NOT NULL,
  "provider_customer_id" text NOT NULL,
  "email" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "plans" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "limits" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "plan_id" varchar(64) NOT NULL REFERENCES "plans"("id") ON DELETE restrict,
  "status" "subscription_status" DEFAULT 'INACTIVE' NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "provider_subscription_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "billing_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "initiated_by_account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "provider" "billing_provider" DEFAULT 'DODO' NOT NULL,
  "type" "billing_transaction_type" DEFAULT 'SUBSCRIPTION' NOT NULL,
  "status" "billing_transaction_status" DEFAULT 'CHECKOUT_CREATED' NOT NULL,
  "provider_checkout_id" text,
  "provider_order_id" text,
  "provider_customer_id" text,
  "provider_customer_external_id" text,
  "provider_product_id" text NOT NULL,
  "product_key" text NOT NULL,
  "product_label" text NOT NULL,
  "amount_cents" integer,
  "currency" varchar(8),
  "metadata" jsonb,
  "last_webhook_id" text,
  "last_webhook_type" text,
  "last_webhook_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "accounts_handle_unique" ON "accounts" ("handle") WHERE "accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "accounts_lifecycle_status_idx" ON "accounts" ("lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" ("slug") WHERE "organizations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_unique" ON "members" ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" ("user_id");--> statement-breakpoint
CREATE INDEX "members_org_idx" ON "members" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" ("email");--> statement-breakpoint
CREATE INDEX "styles_owner_idx" ON "styles" ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "styles_owner_handle_unique" ON "styles" ("owner_id","handle") WHERE "styles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "style_versions_style_idx" ON "style_versions" ("style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "style_versions_style_version_unique" ON "style_versions" ("style_id","version");--> statement-breakpoint
CREATE INDEX "api_keys_owner_idx" ON "api_keys" ("owner_id");--> statement-breakpoint
CREATE INDEX "api_keys_hash_idx" ON "api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_scopes_idx" ON "api_keys" USING gin ("scopes");--> statement-breakpoint
CREATE INDEX "tileset_sources_owner_idx" ON "tileset_sources" ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tileset_sources_owner_handle_unique" ON "tileset_sources" ("owner_id","handle") WHERE "tileset_sources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "usage_logs_api_key_idx" ON "usage_logs" ("api_key_id");--> statement-breakpoint
CREATE INDEX "usage_logs_account_idx" ON "usage_logs" ("account_id");--> statement-breakpoint
CREATE INDEX "usage_logs_timestamp_idx" ON "usage_logs" ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_account_idx" ON "audit_events" ("account_id");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "uploads_account_idx" ON "uploads" ("account_id");--> statement-breakpoint
CREATE INDEX "uploads_status_idx" ON "uploads" ("status");--> statement-breakpoint
CREATE INDEX "datasets_account_idx" ON "datasets" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_account_handle_unique" ON "datasets" ("account_id","handle") WHERE "datasets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "dataset_versions_dataset_idx" ON "dataset_versions" ("dataset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_version_unique" ON "dataset_versions" ("dataset_id","version");--> statement-breakpoint
CREATE INDEX "tilesets_account_idx" ON "tilesets" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tilesets_account_handle_unique" ON "tilesets" ("account_id","handle") WHERE "tilesets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tileset_versions_tileset_idx" ON "tileset_versions" ("tileset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tileset_versions_tileset_version_unique" ON "tileset_versions" ("tileset_id","version");--> statement-breakpoint
CREATE INDEX "style_publications_style_idx" ON "style_publications" ("style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "style_publications_style_alias_unique" ON "style_publications" ("style_id","alias");--> statement-breakpoint
CREATE INDEX "processing_jobs_account_idx" ON "processing_jobs" ("account_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs" ("status");--> statement-breakpoint
CREATE INDEX "processing_job_logs_job_idx" ON "processing_job_logs" ("job_id");--> statement-breakpoint
CREATE INDEX "event_outbox_next_event_idx" ON "event_outbox" ("status","process_at");--> statement-breakpoint
CREATE INDEX "event_outbox_event_name_idx" ON "event_outbox" ("event_name");--> statement-breakpoint
CREATE INDEX "storage_objects_account_idx" ON "storage_objects" ("account_id");--> statement-breakpoint
CREATE INDEX "storage_objects_resource_idx" ON "storage_objects" ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_key_unique" ON "storage_objects" ("provider","bucket","storage_key") WHERE "storage_objects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "basemap_releases_name_version_unique" ON "basemap_releases" ("name","version");--> statement-breakpoint
CREATE INDEX "usage_rollups_account_period_idx" ON "usage_rollups" ("account_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_account_provider_unique" ON "billing_customers" ("account_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_provider_id_unique" ON "billing_customers" ("provider","provider_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_account_idx" ON "subscriptions" ("account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" ("status");--> statement-breakpoint
CREATE INDEX "billing_transactions_account_idx" ON "billing_transactions" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_transactions_checkout_unique" ON "billing_transactions" ("provider","provider_checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_transactions_order_unique" ON "billing_transactions" ("provider","provider_order_id");
