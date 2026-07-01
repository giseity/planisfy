CREATE TABLE "runtime_installations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "worker_node_id" uuid,
  "resource_type" varchar(64) NOT NULL,
  "build_id" uuid,
  "artifact_id" uuid,
  "release_id" uuid,
  "status" varchar(32) DEFAULT 'installing' NOT NULL,
  "runtime_path" text,
  "versioned_path" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "installed_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "runtime_installations" ADD CONSTRAINT "runtime_installations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_installations" ADD CONSTRAINT "runtime_installations_worker_node_id_worker_nodes_id_fk" FOREIGN KEY ("worker_node_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "runtime_installations_account_idx" ON "runtime_installations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "runtime_installations_worker_idx" ON "runtime_installations" USING btree ("worker_node_id");--> statement-breakpoint
CREATE INDEX "runtime_installations_resource_idx" ON "runtime_installations" USING btree ("resource_type","status");
