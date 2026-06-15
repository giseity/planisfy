CREATE TYPE "billing_transaction_type" AS ENUM('SUBSCRIPTION');--> statement-breakpoint
CREATE TYPE "billing_transaction_status" AS ENUM('CHECKOUT_CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'UNKNOWN');--> statement-breakpoint

TRUNCATE TABLE "billing_transactions";--> statement-breakpoint

ALTER TABLE "billing_transactions" ADD COLUMN "initiated_by_account_id" uuid REFERENCES "accounts"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "type" "billing_transaction_type" DEFAULT 'SUBSCRIPTION' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ALTER COLUMN "status" TYPE "billing_transaction_status" USING 'CHECKOUT_CREATED'::"billing_transaction_status";--> statement-breakpoint
ALTER TABLE "billing_transactions" ALTER COLUMN "status" SET DEFAULT 'CHECKOUT_CREATED';--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "provider_customer_external_id" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "provider_product_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "product_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "product_label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "last_webhook_id" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "last_webhook_type" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "last_webhook_at" timestamp with time zone;
