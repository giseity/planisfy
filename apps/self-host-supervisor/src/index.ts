import { loadWorkspaceEnv } from "@planisfy/env/node";

import { serve } from "@hono/node-server";

import { createSupervisorApp, supervisorConfigFromEnv } from "./supervisor";

loadWorkspaceEnv();

const config = supervisorConfigFromEnv();
const port = Number(process.env.PORT ?? "4010");
const hostname = process.env.HOST ?? "0.0.0.0";

serve({
  fetch: createSupervisorApp(config).fetch,
  hostname,
  port,
});

console.log(`Planisfy self-host supervisor listening on ${hostname}:${port}`);
