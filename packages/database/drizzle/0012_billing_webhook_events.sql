CREATE TABLE "billing_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" "billing_provider" DEFAULT 'DODO' NOT NULL,
  "webhook_id" text NOT NULL,
  "event_type" text,
  "payload" jsonb,
  "result" jsonb,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_id_unique" ON "billing_webhook_events" ("provider","webhook_id");
