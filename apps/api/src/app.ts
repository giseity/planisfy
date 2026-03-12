import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware, dualAuthMiddleware, type AuthEnv } from "./middleware/auth";
import { apiKeyMiddleware } from "./middleware/api-key";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { healthRoute } from "./routes/health";
import { stylesRoute } from "./routes/styles";
import { auditRoute } from "./routes/audit";
import { keysRoute } from "./routes/keys";
import { auth } from "@planisfy/auth/auth";

const app = new Hono<AuthEnv>();

// ── Global middleware ───────────────────────────────────────────────────────
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3001",
      "https://console.planisfy.com",
    ],
    credentials: true,
  })
);
app.use("*", logger());

// ── better-auth handler (signup, login, session, org endpoints) ─────────
// better-auth's handler accepts a standard Request and returns a Response,
// which maps directly to Hono's fetch-based API.
app.on(["GET", "POST"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// ── Public routes ───────────────────────────────────────────────────────────
app.route("/", healthRoute);

// ── Public API routes (require API key or session) ──────────────────────────
// Pipeline: API key extraction → auth → rate limit
const publicApiPaths = [
  "/tiles/*",
  "/styles/v1/*",
  "/fonts/*",
  "/geocoding/*",
  "/directions/*",
  "/isochrone/*",
  "/matching/*",
  "/matrix/*",
  "/optimized-trips/*",
  "/elevation/*",
  "/static/*",
];
for (const path of publicApiPaths) {
  app.use(path, apiKeyMiddleware, dualAuthMiddleware, rateLimitMiddleware);
}

// ── Protected routes (require session cookie) ───────────────────────────────
app.use("/console/*", authMiddleware);
app.route("/console", stylesRoute);
app.route("/console", auditRoute);
app.route("/console", keysRoute);

export { app };
