ALTER TABLE "geocoding_builds"
ADD COLUMN "profile_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

UPDATE "geocoding_builds"
SET "profile" = 'planet_geocoder'
WHERE "profile" = 'planet_address';--> statement-breakpoint

ALTER TABLE "geocoding_builds"
ALTER COLUMN "profile" SET DEFAULT 'planet_geocoder';
