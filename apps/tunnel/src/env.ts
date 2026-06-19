import { createEnv, portSchema, z } from "@planisfy/env";
import { loadWorkspaceEnv } from "@planisfy/env/node";

loadWorkspaceEnv();

const schema = z.object({
  PORT: portSchema,
  CLOUDFLARED_BIN: z.string().min(1).default("cloudflared"),
  CLOUDFLARE_TUNNEL_NAME: z.string().min(1),
  CLOUDFLARE_TUNNEL_PUBLIC_URL: z
    .string()
    .url()
    .default("https://api-dev.planisfy.com"),
});

export const env = createEnv(schema, process.env, { appName: "tunnel" });
