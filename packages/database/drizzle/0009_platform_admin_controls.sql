CREATE TABLE "platform_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(128) NOT NULL,
  "value" text DEFAULT '' NOT NULL,
  "value_type" varchar(32) DEFAULT 'text' NOT NULL,
  "category" varchar(64) DEFAULT 'General' NOT NULL,
  "description" text,
  "is_secret" boolean DEFAULT false NOT NULL,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(128) NOT NULL,
  "label" varchar(128) NOT NULL,
  "description" text,
  "scope" varchar(64) DEFAULT 'global' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "rollout_percent" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(180) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "audience" varchar(64) DEFAULT 'all' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "updated_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);--> statement-breakpoint

CREATE UNIQUE INDEX "platform_config_key_unique" ON "platform_config" ("key");--> statement-breakpoint
CREATE INDEX "platform_config_category_idx" ON "platform_config" ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_key_unique" ON "feature_flags" ("key");--> statement-breakpoint
CREATE INDEX "feature_flags_scope_idx" ON "feature_flags" ("scope");--> statement-breakpoint
CREATE INDEX "feature_flags_archived_idx" ON "feature_flags" ("archived_at");--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" ("status");--> statement-breakpoint
CREATE INDEX "announcements_audience_idx" ON "announcements" ("audience");--> statement-breakpoint
CREATE INDEX "announcements_schedule_idx" ON "announcements" ("starts_at","ends_at");
