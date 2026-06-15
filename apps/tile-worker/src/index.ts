import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";

serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`Planisfy tile-worker listening on ${env.HOST}:${info.port}`);
});

const shutdown = (signal: string) => {
  console.log(`Planisfy tile-worker shutting down: ${signal}`);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
