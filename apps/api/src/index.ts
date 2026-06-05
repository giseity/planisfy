import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";
import { logger } from "./lib/logger";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("API server started", { port: info.port, env: env.NODE_ENV });
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info("Shutting down", { signal });
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
