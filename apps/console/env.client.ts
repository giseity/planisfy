import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_ADMIN_URL: z.string().url(),
  NEXT_PUBLIC_MARKETING_URL: z.string().url(),
  NEXT_PUBLIC_AUTH_ORIGIN: z.string().url(),
  NEXT_PUBLIC_CONSOLE_API_PATH: z.string().min(1),
});

export const clientEnv = createEnv(
  schema,
  {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
    NEXT_PUBLIC_AUTH_ORIGIN: process.env.NEXT_PUBLIC_AUTH_ORIGIN,
    NEXT_PUBLIC_CONSOLE_API_PATH: process.env.NEXT_PUBLIC_CONSOLE_API_PATH,
  },
  { appName: "console client", onInvalid: "throw" }
);
