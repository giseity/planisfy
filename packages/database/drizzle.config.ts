import { defineConfig } from "drizzle-kit";
import { loadWorkspaceEnv } from "@planisfy/env/node";

loadWorkspaceEnv();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
