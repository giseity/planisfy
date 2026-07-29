ALTER TABLE "routing_graph_builds"
  ADD CONSTRAINT "routing_graph_builds_valhalla_image_pinned_check"
  CHECK ("valhalla_image" ~ '^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)+@sha256:[a-f0-9]{64}$')
  NOT VALID;
--> statement-breakpoint
ALTER TABLE "basemap_builds"
  ALTER COLUMN "planetiler_image" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "basemap_builds"
  ADD CONSTRAINT "basemap_builds_planetiler_image_pinned_check"
  CHECK ("planetiler_image" ~ '^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)+@sha256:[a-f0-9]{64}$')
  NOT VALID;
