DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "routing_graph_artifacts" artifact
    JOIN "storage_objects" object ON object."id" = artifact."storage_object_id"
    WHERE artifact."account_id" IS DISTINCT FROM object."account_id"
  ) OR EXISTS (
    SELECT 1
    FROM "basemap_artifacts" artifact
    JOIN "storage_objects" object ON object."id" = artifact."storage_object_id"
    WHERE artifact."account_id" IS DISTINCT FROM object."account_id"
  ) OR EXISTS (
    SELECT 1
    FROM "geocoding_artifacts" artifact
    JOIN "storage_objects" object ON object."id" = artifact."storage_object_id"
    WHERE artifact."account_id" IS DISTINCT FROM object."account_id"
  ) THEN
    RAISE EXCEPTION 'Batch 03 migration blocked: cross-tenant artifact storage references exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "routing_graph_artifacts"
    WHERE "status" = 'available'
    GROUP BY "build_id", "kind" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "basemap_artifacts"
    WHERE "status" = 'available'
    GROUP BY "build_id", "kind" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "routing_graph_releases"
    WHERE "artifact_id" IS NOT NULL
    GROUP BY "build_id", "artifact_id" HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "basemap_releases"
    WHERE "artifact_id" IS NOT NULL
    GROUP BY "build_id", "artifact_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Batch 03 migration blocked: duplicate available artifacts or releases exist';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_id_account_unique" ON "storage_objects" USING btree ("id", "account_id");
--> statement-breakpoint
ALTER TABLE "routing_graph_artifacts" DROP CONSTRAINT "routing_graph_artifacts_storage_object_id_storage_objects_id_fk";
--> statement-breakpoint
ALTER TABLE "basemap_artifacts" DROP CONSTRAINT "basemap_artifacts_storage_object_id_storage_objects_id_fk";
--> statement-breakpoint
ALTER TABLE "geocoding_artifacts" DROP CONSTRAINT "geocoding_artifacts_storage_object_id_storage_objects_id_fk";
--> statement-breakpoint
ALTER TABLE "routing_graph_artifacts" ADD CONSTRAINT "routing_graph_artifacts_storage_account_fk" FOREIGN KEY ("storage_object_id", "account_id") REFERENCES "public"."storage_objects"("id", "account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "basemap_artifacts" ADD CONSTRAINT "basemap_artifacts_storage_account_fk" FOREIGN KEY ("storage_object_id", "account_id") REFERENCES "public"."storage_objects"("id", "account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "geocoding_artifacts" ADD CONSTRAINT "geocoding_artifacts_storage_account_fk" FOREIGN KEY ("storage_object_id", "account_id") REFERENCES "public"."storage_objects"("id", "account_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "routing_graph_artifacts_available_build_kind_unique" ON "routing_graph_artifacts" USING btree ("build_id", "kind") WHERE "status" = 'available';
--> statement-breakpoint
CREATE UNIQUE INDEX "basemap_artifacts_available_build_kind_unique" ON "basemap_artifacts" USING btree ("build_id", "kind") WHERE "status" = 'available';
--> statement-breakpoint
CREATE UNIQUE INDEX "routing_graph_releases_build_artifact_unique" ON "routing_graph_releases" USING btree ("build_id", "artifact_id") WHERE "artifact_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "basemap_releases_build_artifact_unique" ON "basemap_releases" USING btree ("build_id", "artifact_id") WHERE "artifact_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "root_agent_job_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "worker_node_id" uuid NOT NULL,
  "target_type" varchar(64) NOT NULL,
  "target_id" uuid NOT NULL,
  "phase" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "lease_expires_at" timestamp with time zone NOT NULL,
  "last_renewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "outcome" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "root_agent_job_claims_phase_check" CHECK ("phase" IN ('build', 'activation')),
  CONSTRAINT "root_agent_job_claims_status_check" CHECK ("status" IN ('active', 'completed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "root_agent_job_claims" ADD CONSTRAINT "root_agent_job_claims_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_job_claims" ADD CONSTRAINT "root_agent_job_claims_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "root_agent_job_claims_worker_idx" ON "root_agent_job_claims" USING btree ("worker_node_id", "status");
--> statement-breakpoint
CREATE INDEX "root_agent_job_claims_expiry_idx" ON "root_agent_job_claims" USING btree ("status", "lease_expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "root_agent_job_claims_active_target_unique" ON "root_agent_job_claims" USING btree ("target_type", "target_id", "phase") WHERE "status" = 'active';
--> statement-breakpoint
CREATE TABLE "root_agent_artifact_upload_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "worker_node_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "target_type" varchar(64) NOT NULL,
  "build_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "status" varchar(32) DEFAULT 'creating' NOT NULL,
  "provider" varchar(32) NOT NULL,
  "bucket" varchar(256) NOT NULL,
  "storage_key" text NOT NULL,
  "multipart_upload_id" text,
  "part_size" bigint,
  "part_count" integer,
  "parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "file_name" varchar(256) NOT NULL,
  "content_type" varchar(128) NOT NULL,
  "size" bigint NOT NULL,
  "checksum_sha256" varchar(128),
  "artifact_kind" varchar(64) NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completed_artifact_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "root_agent_upload_sessions_status_check" CHECK ("status" IN ('creating', 'ready', 'finalizing', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "root_agent_artifact_upload_sessions" ADD CONSTRAINT "root_agent_artifact_upload_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_artifact_upload_sessions" ADD CONSTRAINT "root_agent_artifact_upload_sessions_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "root_agent_artifact_upload_sessions" ADD CONSTRAINT "root_agent_artifact_upload_sessions_claim_id_root_agent_job_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."root_agent_job_claims"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "root_agent_upload_sessions_claim_idx" ON "root_agent_artifact_upload_sessions" USING btree ("claim_id");
--> statement-breakpoint
CREATE INDEX "root_agent_upload_sessions_expiry_idx" ON "root_agent_artifact_upload_sessions" USING btree ("status", "expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "root_agent_upload_sessions_request_unique" ON "root_agent_artifact_upload_sessions" USING btree ("claim_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "root_agent_upload_sessions_storage_key_unique" ON "root_agent_artifact_upload_sessions" USING btree ("provider", "bucket", "storage_key");
--> statement-breakpoint
UPDATE "routing_graph_builds"
SET "status" = 'canceled', "completed_at" = now(), "updated_at" = now()
WHERE "status" IN ('assigned', 'preparing', 'downloading_source', 'building_admins', 'building_tiles', 'packaging', 'uploading', 'canceling')
  AND "cancel_requested_at" IS NOT NULL;
--> statement-breakpoint
UPDATE "basemap_builds"
SET "status" = 'canceled', "completed_at" = now(), "updated_at" = now()
WHERE "status" IN ('assigned', 'preparing', 'downloading_source', 'building_tiles', 'packaging', 'uploading', 'canceling')
  AND "cancel_requested_at" IS NOT NULL;
--> statement-breakpoint
UPDATE "routing_graph_builds"
SET "status" = 'queued', "assigned_at" = NULL, "updated_at" = now()
WHERE "status" IN ('assigned', 'preparing', 'downloading_source', 'building_admins', 'building_tiles', 'packaging', 'uploading')
  AND "cancel_requested_at" IS NULL;
--> statement-breakpoint
UPDATE "basemap_builds"
SET "status" = 'queued', "assigned_at" = NULL, "updated_at" = now()
WHERE "status" IN ('assigned', 'preparing', 'downloading_source', 'building_tiles', 'packaging', 'uploading')
  AND "cancel_requested_at" IS NULL;
--> statement-breakpoint
UPDATE "routing_graph_builds" SET "activation_status" = 'activation_requested', "updated_at" = now() WHERE "activation_status" = 'activating';
--> statement-breakpoint
UPDATE "basemap_builds" SET "activation_status" = 'activation_requested', "updated_at" = now() WHERE "activation_status" = 'activating';
--> statement-breakpoint
UPDATE "geocoding_releases" SET "activation_status" = 'activation_requested', "updated_at" = now() WHERE "activation_status" = 'activating';
