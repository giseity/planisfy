import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  NEXT_PUBLIC_ADMIN_URL: z.string().url().default("http://localhost:3003"),
  NEXT_PUBLIC_MARKETING_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CONSOLE_API_PATH: z.string().min(1).default("/api/v1/console"),
});

export const clientEnv = createEnv(
  schema,
  {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
    NEXT_PUBLIC_CONSOLE_API_PATH: process.env.NEXT_PUBLIC_CONSOLE_API_PATH,
  },
  { appName: "console client", onInvalid: "throw" }
);
