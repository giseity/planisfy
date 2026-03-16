import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestLogger } from "./lib/logger";
import { authMiddleware, dualAuthMiddleware, type AuthEnv } from "./middleware/auth";
import { apiKeyMiddleware } from "./middleware/api-key";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { usageLogMiddleware } from "./middleware/usage-log";
import { healthRoute } from "./routes/health";
import { stylesRoute } from "./routes/styles";
import { auditRoute } from "./routes/audit";
import { keysRoute } from "./routes/keys";
import { usageRoute } from "./routes/usage";
import { tilesRoute } from "./routes/tiles";
import { publicStylesRoute } from "./routes/public-styles";
import { fontsRoute } from "./routes/fonts";
import { directionsRoute } from "./routes/directions";
import { geocodingRoute } from "./routes/geocoding";
import { elevationRoute } from "./routes/elevation";
import { staticMapRoute } from "./routes/static-map";
import { emailRoute } from "./routes/email";
import { sourcesRoute } from "./routes/sources";
import { billingRoute } from "./routes/billing";
import { profileRoute } from "./routes/profile";
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
app.use("*", requestLogger());

// ── better-auth handler (signup, login, session, org endpoints) ─────────
// better-auth's handler accepts a standard Request and returns a Response,
// which maps directly to Hono's fetch-based API.
app.on(["GET", "POST"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// ── Public routes ───────────────────────────────────────────────────────────
app.route("/", healthRoute);

// ── Public API routes (require API key or session) ──────────────────────────
// Pipeline: API key extraction → auth → rate limit → usage log
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
  app.use(path, apiKeyMiddleware, dualAuthMiddleware, rateLimitMiddleware, usageLogMiddleware);
}

// ── Public API route handlers ────────────────────────────────────────────────
app.route("/", tilesRoute);
app.route("/", publicStylesRoute);
app.route("/", fontsRoute);
app.route("/", directionsRoute);
app.route("/", geocodingRoute);
app.route("/", elevationRoute);
app.route("/", staticMapRoute);

// ── Internal routes (no auth — called by platform services only) ─────────────
app.route("/", emailRoute);

// ── Protected routes (require session cookie) ───────────────────────────────
app.use("/console/*", authMiddleware);
app.route("/console", stylesRoute);
app.route("/console", auditRoute);
app.route("/console", keysRoute);
app.route("/console", usageRoute);
app.route("/console", sourcesRoute);
app.route("/console", billingRoute);
app.route("/console", profileRoute);

export { app };
