import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  noExternal: [/^@planisfy\//],
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
});
