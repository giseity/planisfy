import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  noExternal: ["@planisfy/geodata-contracts", "@planisfy/outbound"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
});
