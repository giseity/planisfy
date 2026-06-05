import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  API_URL: z.string().url().default("https://api.planisfy.localhost"),
});

export const serverEnv = createEnv(schema, process.env, {
  appName: "console server",
});
