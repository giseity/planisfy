import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API server listening on port ${info.port}`);
});
