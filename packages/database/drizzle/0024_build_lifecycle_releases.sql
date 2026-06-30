CREATE TYPE "public"."routing_graph_release_status" AS ENUM(
  'draft',
  'published',
  'deprecated'
);--> statement-breakpoint
CREATE TYPE "public"."basemap_build_status" AS ENUM(
  'queued',
  'assigned',
  'preparing',
  'downloading_source',
  'building_tiles',
  'packaging',
  'uploading',
  'succeeded',
  'failed',
  'canceling',
  'canceled'
);--> statement-breakpoint
CREATE TYPE "public"."basemap_artifact_status" AS ENUM(
  'pending',
  'uploading',
  'available',
  'failed',
  'activated'
);--> statement-breakpoint
CREATE TYPE "public"."basemap_release_status" AS ENUM(
  'draft',
  'published',
  'deprecated'
);--> statement-breakpoint
CREATE TYPE "public"."basemap_activation_status" AS ENUM(
  'inactive',
  'activation_requested',
  'activating',
  'active',
  'failed'
);--> statement-breakpoint

CREATE TABLE "routing_graph_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "build_id" uuid NOT NULL,
  "artifact_id" uuid,
  "name" varchar(128) NOT NULL,
  "version" varchar(64) NOT NULL,
  "status" "routing_graph_release_status" DEFAULT 'draft' NOT NULL,
  "activation_status" "routing_graph_activation_status" DEFAULT 'inactive' NOT NULL,
  "source_data_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "activated_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "deprecated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DROP INDEX IF EXISTS "basemap_releases_name_version_unique";--> statement-breakpoint
DROP TABLE IF EXISTS "basemap_releases" CASCADE;--> statement-breakpoint

CREATE TABLE "basemap_builds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "status" "basemap_build_status" DEFAULT 'queued' NOT NULL,
  "activation_status" "basemap_activation_status" DEFAULT 'inactive' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "worker_node_id" uuid,
  "activation_worker_node_id" uuid,
  "engine" varchar(64) DEFAULT 'planetiler_osm' NOT NULL,
  "source_kind" varchar(64) DEFAULT 'osm_pbf' NOT NULL,
  "source_url" text NOT NULL,
  "source_preset" varchar(128),
  "planetiler_image" text DEFAULT 'ghcr.io/onthegomap/planetiler:latest' NOT NULL,
  "profile" varchar(128) DEFAULT 'openmaptiles' NOT NULL,
  "output_format" varchar(32) DEFAULT 'pmtiles' NOT NULL,
  "area_of_interest" jsonb,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" varchar(128),
  "error_message" text,
  "cancel_requested_at" timestamp with time zone,
  "assigned_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "basemap_build_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "build_id" uuid NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "basemap_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "build_id" uuid NOT NULL,
  "storage_object_id" uuid,
  "kind" varchar(64) DEFAULT 'basemap_tiles' NOT NULL,
  "status" "basemap_artifact_status" DEFAULT 'pending' NOT NULL,
  "file_name" varchar(256) NOT NULL,
  "size" bigint,
  "checksum_sha256" varchar(128),
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "basemap_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "version" varchar(64) NOT NULL,
  "status" "basemap_release_status" DEFAULT 'draft' NOT NULL,
  "activation_status" "basemap_activation_status" DEFAULT 'inactive' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "build_id" uuid,
  "artifact_id" uuid,
  "source_data_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "schema_version" varchar(64),
  "artifact_storage_object_id" uuid,
  "manifest_storage_object_id" uuid,
  "bounds" jsonb,
  "min_zoom" integer DEFAULT 0,
  "max_zoom" integer DEFAULT 14,
  "attribution" text,
  "tilejson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "style_compatibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "martin_source" varchar(256),
  "martin_source_versioned" varchar(256),
  "activation_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "build_job_id" uuid,
  "activated_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "deprecated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "routing_graph_releases" ADD CONSTRAINT "routing_graph_releases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_graph_releases" ADD CONSTRAINT "routing_graph_releases_build_id_routing_graph_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."routing_graph_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_graph_releases" ADD CONSTRAINT "routing_graph_releases_artifact_id_routing_graph_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."routing_graph_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "basemap_builds" ADD CONSTRAINT "basemap_builds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_builds" ADD CONSTRAINT "basemap_builds_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_builds" ADD CONSTRAINT "basemap_builds_activation_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("activation_worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_build_logs" ADD CONSTRAINT "basemap_build_logs_build_id_basemap_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."basemap_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_artifacts" ADD CONSTRAINT "basemap_artifacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_artifacts" ADD CONSTRAINT "basemap_artifacts_build_id_basemap_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."basemap_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_artifacts" ADD CONSTRAINT "basemap_artifacts_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_build_id_basemap_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."basemap_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_artifact_id_basemap_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."basemap_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_artifact_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("artifact_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_manifest_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("manifest_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basemap_releases" ADD CONSTRAINT "basemap_releases_build_job_id_processing_jobs_id_fk" FOREIGN KEY ("build_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "routing_graph_releases_account_idx" ON "routing_graph_releases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "routing_graph_releases_build_idx" ON "routing_graph_releases" USING btree ("build_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_graph_releases_name_version_unique" ON "routing_graph_releases" USING btree ("account_id","name","version");--> statement-breakpoint
CREATE INDEX "basemap_builds_account_idx" ON "basemap_builds" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "basemap_builds_status_idx" ON "basemap_builds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "basemap_builds_worker_idx" ON "basemap_builds" USING btree ("worker_node_id");--> statement-breakpoint
CREATE INDEX "basemap_build_logs_build_idx" ON "basemap_build_logs" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "basemap_artifacts_account_idx" ON "basemap_artifacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "basemap_artifacts_build_idx" ON "basemap_artifacts" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "basemap_releases_account_idx" ON "basemap_releases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "basemap_releases_build_idx" ON "basemap_releases" USING btree ("build_id");--> statement-breakpoint
CREATE UNIQUE INDEX "basemap_releases_name_version_unique" ON "basemap_releases" USING btree ("account_id","name","version");
