ALTER TABLE "source_imports" ADD COLUMN "target_tileset_id" uuid REFERENCES "tilesets"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "source_imports_target_tileset_idx" ON "source_imports" ("target_tileset_id");
