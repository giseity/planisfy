ALTER TABLE "event_outbox" ADD COLUMN "deduplication_key" varchar(256);--> statement-breakpoint
CREATE UNIQUE INDEX "event_outbox_deduplication_key_unique" ON "event_outbox" USING btree ("deduplication_key") WHERE "event_outbox"."deduplication_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "quota_notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_notification_deliveries_event_user_unique" UNIQUE("outbox_event_id","user_id")
);--> statement-breakpoint
ALTER TABLE "quota_notification_deliveries" ADD CONSTRAINT "quota_notification_deliveries_outbox_event_id_event_outbox_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."event_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_notification_deliveries" ADD CONSTRAINT "quota_notification_deliveries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_notification_deliveries" ADD CONSTRAINT "quota_notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quota_notification_deliveries_due_idx" ON "quota_notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "quota_notification_deliveries_event_idx" ON "quota_notification_deliveries" USING btree ("outbox_event_id");
