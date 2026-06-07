import "dotenv/config";

import { serve } from "@hono/node-server";

import { createSupervisorApp, supervisorConfigFromEnv } from "./supervisor";

const config = supervisorConfigFromEnv();
const port = Number(process.env.PORT ?? "4010");
const hostname = process.env.HOST ?? "0.0.0.0";

serve({
  fetch: createSupervisorApp(config).fetch,
  hostname,
  port,
});

console.log(`Planisfy self-host supervisor listening on ${hostname}:${port}`);
