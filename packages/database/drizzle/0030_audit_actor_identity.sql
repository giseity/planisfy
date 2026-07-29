ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" uuid;
ALTER TABLE "audit_events" ADD COLUMN "request_id" varchar(128);
ALTER TABLE "audit_events" ADD COLUMN "outcome" varchar(16) DEFAULT 'SUCCESS' NOT NULL;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "audit_events_actor_user_idx" ON "audit_events" USING btree ("actor_user_id");
CREATE INDEX "audit_events_request_idx" ON "audit_events" USING btree ("request_id");

-- Reliable historical ownership: personal account IDs are also user IDs.
UPDATE "audit_events" AS event
SET "actor_user_id" = event."account_id"
FROM "accounts" AS account
JOIN "users" AS actor ON actor."id" = account."id"
WHERE event."account_id" = account."id"
  AND account."type" = 'USER'
  AND event."actor_user_id" IS NULL;

-- Organization-era writers commonly persisted the authenticated actor in
-- metadata.actorId. Only accept values that resolve to an existing user.
UPDATE "audit_events" AS event
SET "actor_user_id" = actor."id"
FROM "users" AS actor
WHERE event."actor_user_id" IS NULL
  AND event."metadata"->>'actorId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND actor."id" = (event."metadata"->>'actorId')::uuid;
