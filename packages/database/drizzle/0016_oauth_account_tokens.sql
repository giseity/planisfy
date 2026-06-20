ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "id_token" text;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN IF NOT EXISTS "scope" text;
