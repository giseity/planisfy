ALTER TABLE "usage_logs" DROP CONSTRAINT IF EXISTS "usage_logs_api_key_id_api_keys_id_fk";--> statement-breakpoint
UPDATE "usage_logs" SET "api_key_id" = NULL WHERE "api_key_id" IS NOT NULL;--> statement-breakpoint
DROP TABLE IF EXISTS "api_keys" CASCADE;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apikey" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "config_id" varchar(64) DEFAULT 'default' NOT NULL,
  "name" varchar(128),
  "start" varchar(32),
  "prefix" varchar(32),
  "key" varchar(256) NOT NULL,
  "reference_id" uuid NOT NULL,
  "refill_interval" integer,
  "refill_amount" integer,
  "last_refill_at" timestamp with time zone,
  "enabled" boolean DEFAULT true NOT NULL,
  "rate_limit_enabled" boolean DEFAULT false NOT NULL,
  "rate_limit_time_window" integer,
  "rate_limit_max" integer,
  "request_count" integer DEFAULT 0 NOT NULL,
  "remaining" integer,
  "last_request" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "permissions" text,
  "metadata" text,
  CONSTRAINT "apikey_reference_id_accounts_id_fk"
    FOREIGN KEY ("reference_id") REFERENCES "public"."accounts"("id")
    ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_api_key_id_apikey_id_fk"
  FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apikey_key_idx" ON "apikey" USING btree ("key");
