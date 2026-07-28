ALTER TABLE "apikey"
ADD COLUMN "creation_request_id" uuid;--> statement-breakpoint

CREATE UNIQUE INDEX "apikey_reference_creation_request_unique"
ON "apikey" ("reference_id", "creation_request_id")
WHERE "creation_request_id" IS NOT NULL;
