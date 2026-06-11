import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_AUTH_ORIGIN: z.string().url(),
});

export const env = createEnv(schema, process.env, {
  appName: "console server",
});
