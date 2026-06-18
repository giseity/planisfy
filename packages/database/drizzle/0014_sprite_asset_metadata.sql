ALTER TABLE "sprite_assets" ADD COLUMN "folder" varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD COLUMN "source_format" varchar(16) DEFAULT 'png' NOT NULL;--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD COLUMN "raster_storage_object_id" uuid;--> statement-breakpoint
UPDATE "sprite_assets" SET "raster_storage_object_id" = "storage_object_id" WHERE "raster_storage_object_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sprite_assets" ADD CONSTRAINT "sprite_assets_raster_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("raster_storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprite_assets_raster_storage_object_idx" ON "sprite_assets" USING btree ("raster_storage_object_id");--> statement-breakpoint
CREATE INDEX "sprite_assets_account_folder_idx" ON "sprite_assets" USING btree ("account_id","folder");
