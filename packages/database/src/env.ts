import { loadWorkspaceEnv } from "@planisfy/env/node";
import { createEnv, z } from "@planisfy/env";

loadWorkspaceEnv();

const schema = z.object({
  DATABASE_URL: z.string().min(1),
});

export const env = createEnv(schema, process.env, { appName: "database" });
