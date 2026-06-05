import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://admin.planisfy.localhost"),
  NEXT_PUBLIC_API_URL: z.string().url().default("https://api.planisfy.localhost"),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url().default("https://console.planisfy.localhost"),
  NEXT_PUBLIC_MARKETING_URL: z.string().url().default("https://planisfy.localhost"),
});

export const clientEnv = createEnv(
  schema,
  {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  },
  { appName: "admin client", onInvalid: "throw" }
);
