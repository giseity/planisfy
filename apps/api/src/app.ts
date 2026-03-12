import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware, dualAuthMiddleware, type AuthEnv } from "./middleware/auth";
import { apiKeyMiddleware } from "./middleware/api-key";
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
// API key middleware runs first to extract key context, then dual-auth decides
app.use("/tiles/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/styles/v1/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/fonts/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/geocoding/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/directions/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/isochrone/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/matching/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/matrix/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/optimized-trips/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/elevation/*", apiKeyMiddleware, dualAuthMiddleware);
app.use("/static/*", apiKeyMiddleware, dualAuthMiddleware);

// ── Protected routes (require session cookie) ───────────────────────────────
app.use("/console/*", authMiddleware);
app.route("/console", stylesRoute);
app.route("/console", auditRoute);
app.route("/console", keysRoute);

export { app };
