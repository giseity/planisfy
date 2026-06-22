INSERT INTO "plans" ("id", "name", "limits", "active")
VALUES
  ('free', 'Free', '{"monthlyUnits":100000,"requestsPerMinute":100,"maxStyles":3,"maxSources":1,"maxApiKeys":2}'::jsonb, true),
  ('starter', 'Starter', '{"monthlyUnits":1000000,"requestsPerMinute":500,"maxStyles":10,"maxSources":5,"maxApiKeys":10}'::jsonb, true),
  ('scale', 'Scale', '{"monthlyUnits":8000000,"requestsPerMinute":1500,"maxStyles":50,"maxSources":20,"maxApiKeys":40}'::jsonb, true),
  ('platform', 'Platform', '{"monthlyUnits":null,"requestsPerMinute":null,"maxStyles":null,"maxSources":null,"maxApiKeys":null}'::jsonb, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "limits" = EXCLUDED."limits",
  "active" = true;
--> statement-breakpoint
UPDATE "subscriptions" SET "plan_id" = 'starter' WHERE "plan_id" = 'pro';
--> statement-breakpoint
UPDATE "subscriptions" SET "plan_id" = 'scale' WHERE "plan_id" = 'enterprise';
--> statement-breakpoint
UPDATE "plans" SET "active" = false WHERE "id" IN ('pro', 'enterprise');
