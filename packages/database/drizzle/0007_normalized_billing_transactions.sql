DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'billing_transaction_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "billing_transaction_type" AS ENUM('SUBSCRIPTION');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'billing_transaction_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "billing_transaction_status" AS ENUM('CHECKOUT_CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED', 'UNKNOWN');
  END IF;
END $$;--> statement-breakpoint

TRUNCATE TABLE "billing_transactions";--> statement-breakpoint

ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "initiated_by_account_id" uuid REFERENCES "accounts"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "type" "billing_transaction_type" DEFAULT 'SUBSCRIPTION' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ALTER COLUMN "status" TYPE "billing_transaction_status" USING 'CHECKOUT_CREATED'::"billing_transaction_status";--> statement-breakpoint
ALTER TABLE "billing_transactions" ALTER COLUMN "status" SET DEFAULT 'CHECKOUT_CREATED';--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "provider_customer_external_id" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "provider_product_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "product_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "product_label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "last_webhook_id" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "last_webhook_type" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN IF NOT EXISTS "last_webhook_at" timestamp with time zone;
