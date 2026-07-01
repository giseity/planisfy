import { serve } from "@hono/node-server";
import { createRuntimeSupervisorApp, runtimeSupervisorConfigFromEnv } from "./supervisor";
import { env } from "./env";

const config = runtimeSupervisorConfigFromEnv();

serve({
  fetch: createRuntimeSupervisorApp(config).fetch,
  port: env.PORT,
  hostname: env.HOST,
});

console.log(`Planisfy runtime supervisor listening on ${env.HOST}:${env.PORT}`);
