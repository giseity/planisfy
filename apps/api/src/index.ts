import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { logger } from "./lib/logger";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info("API server started", { port: info.port, env: process.env.NODE_ENV || "development" });
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info("Shutting down", { signal });
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
