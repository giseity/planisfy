import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
});
