import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/events",
  "packages/map-styles",
  "packages/platform-policy",
  "packages/storage-paths",
  "packages/style-spec",
  "apps/console",
]);
