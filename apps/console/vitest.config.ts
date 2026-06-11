import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@planisfy/ui": resolve(__dirname, "../../packages/ui/src"),
    },
  },
});
