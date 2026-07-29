ALTER TABLE "subscriptions" ADD COLUMN "provider_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_event_precedence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_event_id" text;--> statement-breakpoint

ALTER TABLE "billing_webhook_events" ADD COLUMN "status" varchar(24) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "billing_webhook_events"
SET "status" = CASE WHEN "processed_at" IS NULL THEN 'PENDING' ELSE 'PROCESSED' END;
--> statement-breakpoint
CREATE INDEX "billing_webhook_events_due_idx" ON "billing_webhook_events" ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_lease_idx" ON "billing_webhook_events" ("status","lease_until");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_processed_idx" ON "billing_webhook_events" ("processed_at");--> statement-breakpoint

CREATE TABLE "usage_billing_period_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "period_id" uuid NOT NULL,
  "contract_id" uuid,
  "segment_start" timestamp with time zone NOT NULL,
  "segment_end" timestamp with time zone NOT NULL,
  "included_units" integer NOT NULL,
  "granted_units" integer DEFAULT 0 NOT NULL,
  "used_units" integer DEFAULT 0 NOT NULL,
  "overage_units" integer DEFAULT 0 NOT NULL,
  "overage_unit_price_micros" integer,
  "hard_spend_cap_cents" integer,
  "overage_amount_micros" bigint DEFAULT 0 NOT NULL,
  "currency" varchar(3) NOT NULL,
  "calculation_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "usage_billing_period_segments_window_check" CHECK ("segment_end" > "segment_start"),
  CONSTRAINT "usage_billing_period_segments_values_check" CHECK (
    "included_units" >= 0 AND "granted_units" >= 0 AND "used_units" >= 0
    AND "overage_units" >= 0 AND "overage_amount_micros" >= 0
  ),
  CONSTRAINT "usage_billing_period_segments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);--> statement-breakpoint
ALTER TABLE "usage_billing_period_segments" ADD CONSTRAINT "usage_billing_period_segments_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "usage_billing_periods"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "usage_billing_period_segments" ADD CONSTRAINT "usage_billing_period_segments_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "managed_contracts"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_billing_period_segments_period_start_unique" ON "usage_billing_period_segments" ("period_id","segment_start");--> statement-breakpoint
CREATE INDEX "usage_billing_period_segments_period_idx" ON "usage_billing_period_segments" ("period_id");--> statement-breakpoint

INSERT INTO "usage_billing_period_segments" (
  "period_id",
  "contract_id",
  "segment_start",
  "segment_end",
  "included_units",
  "granted_units",
  "used_units",
  "overage_units",
  "overage_unit_price_micros",
  "hard_spend_cap_cents",
  "overage_amount_micros",
  "currency",
  "calculation_version"
)
SELECT
  period."id",
  contract."id",
  period."period_start",
  period."period_end",
  period."included_units",
  period."granted_units",
  period."used_units",
  period."overage_units",
  contract."overage_unit_price_micros",
  contract."hard_monthly_spend_cap_cents",
  period."overage_amount_micros",
  CASE
    WHEN UPPER(contract."currency") ~ '^[A-Z]{3}$' THEN UPPER(contract."currency")
    ELSE 'XXX'
  END,
  0
FROM "usage_billing_periods" period
LEFT JOIN LATERAL (
  SELECT
    managed."id",
    managed."overage_unit_price_micros",
    managed."hard_monthly_spend_cap_cents",
    managed."currency"
  FROM "managed_contracts" managed
  WHERE managed."account_id" = period."account_id"
    AND managed."effective_at" <= period."period_start"
    AND (managed."expires_at" IS NULL OR managed."expires_at" > period."period_start")
  ORDER BY managed."effective_at" DESC, managed."created_at" DESC
  LIMIT 1
) contract ON TRUE
WHERE period."period_end" > period."period_start";
--> statement-breakpoint

CREATE TABLE "billing_mutation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "initiated_by_account_id" uuid,
  "operation" varchar(32) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "client_ip" text,
  "status" varchar(24) DEFAULT 'PROCESSING' NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "lease_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_mutation_requests_status_check" CHECK ("status" IN ('PROCESSING','SUCCEEDED','FAILED','UNKNOWN'))
);--> statement-breakpoint
ALTER TABLE "billing_mutation_requests" ADD CONSTRAINT "billing_mutation_requests_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "billing_mutation_requests" ADD CONSTRAINT "billing_mutation_requests_initiated_by_account_id_fk" FOREIGN KEY ("initiated_by_account_id") REFERENCES "accounts"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_mutation_requests_key_unique" ON "billing_mutation_requests" ("account_id","operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "billing_mutation_requests_account_status_idx" ON "billing_mutation_requests" ("account_id","status");--> statement-breakpoint
CREATE INDEX "billing_mutation_requests_account_created_idx" ON "billing_mutation_requests" ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_mutation_requests_ip_created_idx" ON "billing_mutation_requests" ("client_ip","created_at");--> statement-breakpoint

CREATE TABLE "billing_scheduler_state" (
  "job_name" varchar(64) PRIMARY KEY NOT NULL,
  "last_started_at" timestamp with time zone,
  "last_succeeded_at" timestamp with time zone,
  "last_failed_at" timestamp with time zone,
  "last_duration_ms" integer,
  "last_result" jsonb,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "managed_contracts"
  ADD CONSTRAINT "managed_contracts_currency_shape_check"
  CHECK ("currency" ~ '^[A-Z]{3}$') NOT VALID;
