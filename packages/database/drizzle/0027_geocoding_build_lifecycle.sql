CREATE TABLE "geocoding_builds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "activation_status" varchar(32) DEFAULT 'inactive' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "worker_node_id" uuid,
  "activation_worker_node_id" uuid,
  "profile" varchar(64) DEFAULT 'planet_address' NOT NULL,
  "source_url" text NOT NULL,
  "source_date" timestamp with time zone,
  "source_checksum_sha256" varchar(64),
  "pelias_docker_commit" varchar(64),
  "index_name" varchar(128) DEFAULT 'pelias' NOT NULL,
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
  "deleted_at" timestamp with time zone,
  CONSTRAINT "geocoding_builds_progress_check" CHECK ("progress" BETWEEN 0 AND 100)
);--> statement-breakpoint

CREATE TABLE "geocoding_build_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "build_id" uuid NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "geocoding_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "build_id" uuid NOT NULL,
  "storage_object_id" uuid,
  "kind" varchar(64) DEFAULT 'elasticsearch_snapshot' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "file_name" varchar(256) NOT NULL,
  "size" bigint,
  "checksum_sha256" varchar(64),
  "snapshot_name" varchar(128) NOT NULL,
  "snapshot_repository" varchar(128) DEFAULT 'planisfy' NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "geocoding_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "version" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "activation_status" varchar(32) DEFAULT 'inactive' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "build_id" uuid,
  "artifact_id" uuid,
  "source_data_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "activation_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "activated_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "deprecated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "geocoding_builds" ADD CONSTRAINT "geocoding_builds_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_builds" ADD CONSTRAINT "geocoding_builds_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_builds" ADD CONSTRAINT "geocoding_builds_activation_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("activation_worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_build_logs" ADD CONSTRAINT "geocoding_build_logs_build_id_geocoding_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."geocoding_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_artifacts" ADD CONSTRAINT "geocoding_artifacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_artifacts" ADD CONSTRAINT "geocoding_artifacts_build_id_geocoding_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."geocoding_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_artifacts" ADD CONSTRAINT "geocoding_artifacts_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_releases" ADD CONSTRAINT "geocoding_releases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_releases" ADD CONSTRAINT "geocoding_releases_build_id_geocoding_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."geocoding_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geocoding_releases" ADD CONSTRAINT "geocoding_releases_artifact_id_geocoding_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."geocoding_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "geocoding_builds_account_idx" ON "geocoding_builds" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "geocoding_builds_status_idx" ON "geocoding_builds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "geocoding_builds_worker_idx" ON "geocoding_builds" USING btree ("worker_node_id");--> statement-breakpoint
CREATE INDEX "geocoding_build_logs_build_idx" ON "geocoding_build_logs" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "geocoding_artifacts_account_idx" ON "geocoding_artifacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "geocoding_artifacts_build_idx" ON "geocoding_artifacts" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "geocoding_releases_account_idx" ON "geocoding_releases" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "geocoding_releases_build_idx" ON "geocoding_releases" USING btree ("build_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geocoding_releases_name_version_unique" ON "geocoding_releases" USING btree ("account_id","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "geocoding_releases_primary_unique" ON "geocoding_releases" USING btree ("account_id") WHERE "is_primary" = true;
