ALTER TABLE "tilesets" ADD COLUMN "build_job_id" uuid REFERENCES "processing_jobs"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "tilesets_build_job_idx" ON "tilesets" ("build_job_id");
