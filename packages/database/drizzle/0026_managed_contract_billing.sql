CREATE TABLE "managed_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "plan_id" varchar(64) NOT NULL,
  "status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
  "included_monthly_units" integer NOT NULL,
  "overage_enabled" boolean DEFAULT false NOT NULL,
  "overage_unit_price_micros" integer,
  "hard_monthly_spend_cap_cents" integer,
  "currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "provider_subscription_id" text,
  "effective_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "assigned_by_account_id" uuid,
  "assignment_reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "managed_contracts_included_units_check" CHECK ("included_monthly_units" >= 0),
  CONSTRAINT "managed_contracts_overage_check" CHECK (
    "overage_enabled" = false OR (
      "overage_unit_price_micros" > 0
      AND "hard_monthly_spend_cap_cents" >= 0
    )
  ),
  CONSTRAINT "managed_contracts_expiry_check" CHECK (
    "expires_at" IS NULL OR "expires_at" > "effective_at"
  ),
  CONSTRAINT "managed_contracts_reason_check" CHECK (length(trim("assignment_reason")) > 0)
);--> statement-breakpoint

CREATE TABLE "usage_allowance_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "units" integer NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "granted_by_account_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "usage_allowance_grants_units_check" CHECK ("units" > 0),
  CONSTRAINT "usage_allowance_grants_validity_check" CHECK ("valid_until" > "valid_from"),
  CONSTRAINT "usage_allowance_grants_reason_check" CHECK (length(trim("reason")) > 0)
);--> statement-breakpoint

CREATE TABLE "usage_billing_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "included_units" integer NOT NULL,
  "granted_units" integer DEFAULT 0 NOT NULL,
  "used_units" integer DEFAULT 0 NOT NULL,
  "overage_units" integer DEFAULT 0 NOT NULL,
  "overage_amount_micros" bigint DEFAULT 0 NOT NULL,
  "status" varchar(24) DEFAULT 'OPEN' NOT NULL,
  "provider_usage_id" text,
  "reconciled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "usage_billing_periods_period_check" CHECK ("period_end" > "period_start"),
  CONSTRAINT "usage_billing_periods_values_check" CHECK (
    "included_units" >= 0
    AND "granted_units" >= 0
    AND "used_units" >= 0
    AND "overage_units" >= 0
    AND "overage_amount_micros" >= 0
  )
);--> statement-breakpoint

CREATE TABLE "billable_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "endpoint" text NOT NULL,
  "method" varchar(8) NOT NULL,
  "units" integer NOT NULL,
  "status_code" integer,
  "response_body" jsonb,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billable_requests_units_check" CHECK ("units" > 0)
);--> statement-breakpoint

ALTER TABLE "managed_contracts" ADD CONSTRAINT "managed_contracts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_contracts" ADD CONSTRAINT "managed_contracts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_contracts" ADD CONSTRAINT "managed_contracts_assigned_by_account_id_accounts_id_fk" FOREIGN KEY ("assigned_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_allowance_grants" ADD CONSTRAINT "usage_allowance_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_allowance_grants" ADD CONSTRAINT "usage_allowance_grants_granted_by_account_id_accounts_id_fk" FOREIGN KEY ("granted_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_billing_periods" ADD CONSTRAINT "usage_billing_periods_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billable_requests" ADD CONSTRAINT "billable_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "managed_contracts_account_idx" ON "managed_contracts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_contracts_active_account_unique" ON "managed_contracts" USING btree ("account_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "managed_contracts_effective_idx" ON "managed_contracts" USING btree ("account_id","effective_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_contracts_provider_subscription_unique" ON "managed_contracts" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "usage_allowance_grants_account_validity_idx" ON "usage_allowance_grants" USING btree ("account_id","valid_from","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_allowance_grants_idempotency_unique" ON "usage_allowance_grants" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_billing_periods_account_start_unique" ON "usage_billing_periods" USING btree ("account_id","period_start");--> statement-breakpoint
CREATE INDEX "usage_billing_periods_status_idx" ON "usage_billing_periods" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billable_requests_account_idempotency_unique" ON "billable_requests" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "billable_requests_created_idx" ON "billable_requests" USING btree ("created_at");
