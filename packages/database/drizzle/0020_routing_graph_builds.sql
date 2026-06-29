CREATE TYPE "public"."routing_graph_build_status" AS ENUM(
  'queued',
  'assigned',
  'preparing',
  'downloading_source',
  'building_admins',
  'building_tiles',
  'packaging',
  'uploading',
  'succeeded',
  'failed',
  'canceling',
  'canceled'
);
--> statement-breakpoint
CREATE TYPE "public"."routing_graph_artifact_status" AS ENUM(
  'pending',
  'uploading',
  'available',
  'failed',
  'activated'
);
--> statement-breakpoint
CREATE TYPE "public"."routing_graph_activation_status" AS ENUM(
  'inactive',
  'activation_requested',
  'activating',
  'active',
  'failed'
);
--> statement-breakpoint
CREATE TABLE "root_agent_registration_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "kind" "worker_node_kind" DEFAULT 'remote' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_worker_node_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "root_agent_node_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "worker_node_id" uuid NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_graph_builds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "status" "routing_graph_build_status" DEFAULT 'queued' NOT NULL,
  "activation_status" "routing_graph_activation_status" DEFAULT 'inactive' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "worker_node_id" uuid,
  "activation_worker_node_id" uuid,
  "source_url" text NOT NULL,
  "source_preset" varchar(128),
  "valhalla_image" text NOT NULL,
  "include_admins" boolean DEFAULT true NOT NULL,
  "include_timezones" boolean DEFAULT true NOT NULL,
  "elevation_mode" varchar(64) DEFAULT 'none' NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "routing_graph_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "build_id" uuid NOT NULL,
  "storage_object_id" uuid,
  "kind" varchar(64) DEFAULT 'valhalla_graph' NOT NULL,
  "status" "routing_graph_artifact_status" DEFAULT 'pending' NOT NULL,
  "file_name" varchar(256) NOT NULL,
  "size" integer,
  "checksum_sha256" varchar(128),
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_graph_build_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "build_id" uuid NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "root_agent_registration_tokens" ADD CONSTRAINT "root_agent_registration_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_registration_tokens" ADD CONSTRAINT "root_agent_registration_tokens_created_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("created_worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_node_tokens" ADD CONSTRAINT "root_agent_node_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_node_tokens" ADD CONSTRAINT "root_agent_node_tokens_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_builds" ADD CONSTRAINT "routing_graph_builds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_builds" ADD CONSTRAINT "routing_graph_builds_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_builds" ADD CONSTRAINT "routing_graph_builds_activation_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("activation_worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_artifacts" ADD CONSTRAINT "routing_graph_artifacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_artifacts" ADD CONSTRAINT "routing_graph_artifacts_build_id_routing_graph_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."routing_graph_builds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_artifacts" ADD CONSTRAINT "routing_graph_artifacts_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routing_graph_build_logs" ADD CONSTRAINT "routing_graph_build_logs_build_id_routing_graph_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."routing_graph_builds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "root_agent_registration_tokens_account_idx" ON "root_agent_registration_tokens" USING btree ("account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "root_agent_registration_tokens_hash_unique" ON "root_agent_registration_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "root_agent_node_tokens_worker_idx" ON "root_agent_node_tokens" USING btree ("worker_node_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "root_agent_node_tokens_hash_unique" ON "root_agent_node_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "routing_graph_builds_account_idx" ON "routing_graph_builds" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "routing_graph_builds_status_idx" ON "routing_graph_builds" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "routing_graph_builds_worker_idx" ON "routing_graph_builds" USING btree ("worker_node_id");
--> statement-breakpoint
CREATE INDEX "routing_graph_artifacts_account_idx" ON "routing_graph_artifacts" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "routing_graph_artifacts_build_idx" ON "routing_graph_artifacts" USING btree ("build_id");
--> statement-breakpoint
CREATE INDEX "routing_graph_build_logs_build_idx" ON "routing_graph_build_logs" USING btree ("build_id");
