import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  API_URL: z.string().url().default("http://localhost:4000"),
});

export const serverEnv = createEnv(schema, process.env, {
  appName: "console server",
});
