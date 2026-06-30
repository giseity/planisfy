DROP INDEX IF EXISTS "processing_jobs_execution_target_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "processing_jobs_worker_profile_idx";--> statement-breakpoint
ALTER TABLE "processing_jobs" DROP COLUMN IF EXISTS "execution_target_id";--> statement-breakpoint
ALTER TABLE "processing_jobs" DROP COLUMN IF EXISTS "worker_profile_id";--> statement-breakpoint
DROP TABLE IF EXISTS "execution_target_env_vars";--> statement-breakpoint
DROP TABLE IF EXISTS "worker_profiles";--> statement-breakpoint
DROP TABLE IF EXISTS "execution_targets";--> statement-breakpoint
DROP TYPE IF EXISTS "execution_target_auth_mode";--> statement-breakpoint
DROP TYPE IF EXISTS "execution_target_provider";
