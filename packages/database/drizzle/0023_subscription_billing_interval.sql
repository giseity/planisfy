ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" varchar(16) DEFAULT 'monthly' NOT NULL;
