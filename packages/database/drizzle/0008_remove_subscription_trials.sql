TRUNCATE TABLE "subscriptions";--> statement-breakpoint

ALTER TYPE "subscription_status" RENAME TO "subscription_status_old";--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('ACTIVE', 'PAST_DUE', 'CANCELED', 'INACTIVE');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE "subscription_status" USING 'INACTIVE'::"subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';--> statement-breakpoint
DROP TYPE "subscription_status_old";
