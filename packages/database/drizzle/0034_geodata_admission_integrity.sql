ALTER TABLE "storage_objects" ADD COLUMN "processing_job_id" uuid;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_processing_job_id_processing_jobs_id_fk" FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "storage_objects_processing_job_idx" ON "storage_objects" ("processing_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_processing_job_unique" ON "storage_objects" ("processing_job_id") WHERE "processing_job_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

UPDATE "tilesets"
SET
  "min_zoom" = GREATEST(0, LEAST(24, "min_zoom")),
  "max_zoom" = GREATEST(0, LEAST(24, "max_zoom"))
WHERE "min_zoom" IS NOT NULL OR "max_zoom" IS NOT NULL;--> statement-breakpoint
UPDATE "tilesets"
SET "min_zoom" = LEAST("min_zoom", "max_zoom"),
    "max_zoom" = GREATEST("min_zoom", "max_zoom")
WHERE "min_zoom" > "max_zoom";--> statement-breakpoint
ALTER TABLE "tilesets" ADD CONSTRAINT "tilesets_zoom_range_check" CHECK ("min_zoom" BETWEEN 0 AND 24 AND "max_zoom" BETWEEN 0 AND 24 AND "min_zoom" <= "max_zoom");--> statement-breakpoint

UPDATE "tileset_versions"
SET
  "min_zoom" = GREATEST(0, LEAST(24, "min_zoom")),
  "max_zoom" = GREATEST(0, LEAST(24, "max_zoom"))
WHERE "min_zoom" IS NOT NULL OR "max_zoom" IS NOT NULL;--> statement-breakpoint
UPDATE "tileset_versions"
SET "min_zoom" = LEAST("min_zoom", "max_zoom"),
    "max_zoom" = GREATEST("min_zoom", "max_zoom")
WHERE "min_zoom" > "max_zoom";--> statement-breakpoint
ALTER TABLE "tileset_versions" ADD CONSTRAINT "tileset_versions_zoom_range_check" CHECK ("min_zoom" BETWEEN 0 AND 24 AND "max_zoom" BETWEEN 0 AND 24 AND "min_zoom" <= "max_zoom");--> statement-breakpoint
WITH ranked_build_versions AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "build_job_id"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS duplicate_rank
  FROM "tileset_versions"
  WHERE "build_job_id" IS NOT NULL
)
UPDATE "tileset_versions"
SET "build_job_id" = NULL
FROM ranked_build_versions
WHERE "tileset_versions"."id" = ranked_build_versions."id"
  AND ranked_build_versions.duplicate_rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "tileset_versions_build_job_unique" ON "tileset_versions" ("build_job_id") WHERE "build_job_id" IS NOT NULL;
