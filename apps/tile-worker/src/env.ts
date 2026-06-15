import { createEnv, portSchema, z } from "@planisfy/env";
import { loadWorkspaceEnv } from "@planisfy/env/node";

loadWorkspaceEnv();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  HOST: z.string().min(1),
  PORT: portSchema,
  APP_VERSION: z.string().min(1),
});

export const env = createEnv(
  schema,
  {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    HOST: process.env.HOST ?? "0.0.0.0",
    PORT: process.env.PORT ?? "4020",
    APP_VERSION: process.env.APP_VERSION ?? "dev",
  },
  { appName: "tile-worker" },
);
