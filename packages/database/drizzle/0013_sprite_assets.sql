CREATE TABLE "sprite_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" varchar(96) NOT NULL,
  "storage_object_id" uuid NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD CONSTRAINT "sprite_assets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD CONSTRAINT "sprite_assets_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprite_assets_account_idx" ON "sprite_assets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sprite_assets_storage_object_idx" ON "sprite_assets" USING btree ("storage_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprite_assets_account_name_unique" ON "sprite_assets" USING btree ("account_id","name") WHERE "sprite_assets"."deleted_at" IS NULL;
