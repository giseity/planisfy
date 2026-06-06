CREATE TYPE "source_provider" AS ENUM('OVERTURE', 'NATURAL_EARTH', 'CUSTOM');--> statement-breakpoint

CREATE TABLE "source_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "provider" "source_provider" NOT NULL,
  "encrypted_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "saved_regions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "geometry" jsonb,
  "bbox" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "source_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "handle" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "provider" "source_provider" NOT NULL,
  "url" text,
  "credential_id" uuid REFERENCES "source_credentials"("id") ON DELETE set null,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "source_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "source_connection_id" uuid REFERENCES "source_connections"("id") ON DELETE set null,
  "region_id" uuid REFERENCES "saved_regions"("id") ON DELETE set null,
  "dataset_id" uuid REFERENCES "datasets"("id") ON DELETE set null,
  "processing_job_id" uuid REFERENCES "processing_jobs"("id") ON DELETE set null,
  "provider" "source_provider" NOT NULL,
  "source_name" varchar(128) NOT NULL,
  "status" "processing_job_status" DEFAULT 'PENDING' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output" jsonb,
  "error_code" varchar(128),
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX "source_credentials_account_idx" ON "source_credentials" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_credentials_account_name_unique" ON "source_credentials" ("account_id","name") WHERE "source_credentials"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "saved_regions_account_idx" ON "saved_regions" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_regions_account_handle_unique" ON "saved_regions" ("account_id","handle") WHERE "saved_regions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "source_connections_account_idx" ON "source_connections" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_connections_account_handle_unique" ON "source_connections" ("account_id","handle") WHERE "source_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "source_imports_account_idx" ON "source_imports" ("account_id");--> statement-breakpoint
CREATE INDEX "source_imports_status_idx" ON "source_imports" ("status");--> statement-breakpoint
CREATE INDEX "source_imports_dataset_idx" ON "source_imports" ("dataset_id");
