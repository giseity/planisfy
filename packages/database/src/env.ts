import "dotenv/config";
import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://postgres:postgres@localhost:5432/planisfy"),
});

export const env = createEnv(schema, process.env, { appName: "database" });
