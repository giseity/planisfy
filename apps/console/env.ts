import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://console.planisfy.localhost"),
  NEXT_PUBLIC_API_URL: z.string().url().default("https://api.planisfy.localhost"),
  NEXT_PUBLIC_AUTH_ORIGIN: z
    .string()
    .url()
    .default("https://console.planisfy.localhost"),
});

export const env = createEnv(schema, process.env, {
  appName: "console server",
});
