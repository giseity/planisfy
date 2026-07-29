CREATE TYPE "public"."scheduled_operation_run_trigger" AS ENUM('manual', 'scheduled');
--> statement-breakpoint
CREATE TYPE "public"."scheduled_operation_run_disposition" AS ENUM('QUEUED', 'SKIPPED', 'REJECTED');
--> statement-breakpoint
CREATE TABLE "scheduled_operation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"trigger" "scheduled_operation_run_trigger" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"disposition" "scheduled_operation_run_disposition" NOT NULL,
	"processing_job_id" uuid,
	"reason" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_operation_runs" ADD CONSTRAINT "scheduled_operation_runs_schedule_id_scheduled_operations_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."scheduled_operations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduled_operation_runs" ADD CONSTRAINT "scheduled_operation_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduled_operation_runs" ADD CONSTRAINT "scheduled_operation_runs_processing_job_id_processing_jobs_id_fk" FOREIGN KEY ("processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "scheduled_operation_runs_account_idx" ON "scheduled_operation_runs" USING btree ("account_id","created_at");
--> statement-breakpoint
CREATE INDEX "scheduled_operation_runs_job_idx" ON "scheduled_operation_runs" USING btree ("processing_job_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_operation_runs_idempotency_unique" ON "scheduled_operation_runs" USING btree ("schedule_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_operation_runs_slot_unique" ON "scheduled_operation_runs" USING btree ("schedule_id","trigger","scheduled_for");
--> statement-breakpoint
UPDATE "scheduled_operations"
SET "status" = 'paused', "next_run_at" = NULL, "updated_at" = now()
WHERE "kind" = 'custom_command' AND "deleted_at" IS NULL;
--> statement-breakpoint
UPDATE "event_outbox"
SET "status" = 'ARCHIVED',
    "last_error" = 'Custom command schedules were retired by Batch 10',
    "updated_at" = now()
WHERE "event_name" = 'scheduled_operation.run_requested'
  AND "status" IN ('PENDING', 'FAILED');
