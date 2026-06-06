CREATE TYPE "execution_target_provider" AS ENUM('local', 'aws_batch', 'gcp_batch');--> statement-breakpoint
CREATE TYPE "execution_target_auth_mode" AS ENUM('federated', 'static', 'external');--> statement-breakpoint

CREATE TABLE "execution_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "provider" "execution_target_provider" DEFAULT 'local' NOT NULL,
  "auth_mode" "execution_target_auth_mode" DEFAULT 'federated' NOT NULL,
  "region" varchar(128),
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "encrypted_credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "execution_target_env_vars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "execution_target_id" uuid NOT NULL REFERENCES "execution_targets"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "encrypted_value" jsonb NOT NULL,
  "is_secret" boolean DEFAULT true NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "worker_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "image" text,
  "command" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "args" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cpu" integer,
  "memory_mb" integer,
  "timeout_seconds" integer,
  "concurrency" integer,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "processing_jobs" ADD COLUMN "execution_target_id" uuid REFERENCES "execution_targets"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "worker_profile_id" uuid REFERENCES "worker_profiles"("id") ON DELETE set null;--> statement-breakpoint

CREATE INDEX "execution_targets_account_idx" ON "execution_targets" ("account_id");--> statement-breakpoint
CREATE INDEX "execution_targets_provider_idx" ON "execution_targets" ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_targets_account_name_unique" ON "execution_targets" ("account_id","name") WHERE "execution_targets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "execution_target_env_vars_account_idx" ON "execution_target_env_vars" ("account_id");--> statement-breakpoint
CREATE INDEX "execution_target_env_vars_target_idx" ON "execution_target_env_vars" ("execution_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_target_env_vars_target_name_unique" ON "execution_target_env_vars" ("execution_target_id","name") WHERE "execution_target_env_vars"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "worker_profiles_account_idx" ON "worker_profiles" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_profiles_account_name_unique" ON "worker_profiles" ("account_id","name") WHERE "worker_profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "processing_jobs_execution_target_idx" ON "processing_jobs" ("execution_target_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_worker_profile_idx" ON "processing_jobs" ("worker_profile_id");
