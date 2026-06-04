import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { randomUUID } from "crypto";
import { requestLogger } from "./lib/logger";
import { authMiddleware, dualAuthMiddleware, type AuthEnv } from "./middleware/auth";
import { apiKeyMiddleware } from "./middleware/api-key";
import { internalAuthMiddleware } from "./middleware/internal-auth";
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
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") || randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
});
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

// ── Internal routes (called by platform services only) ───────────────────────
app.use("/internal/*", internalAuthMiddleware);
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

// ── Centralized error handler ─────────────────────────────────────────────
app.onError((err, c) => {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    return c.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    }, 400);
  }

  // Hono HTTP exceptions (thrown by middleware etc.)
  if (err instanceof HTTPException) {
    return c.json({
      error: {
        code: "HTTP_ERROR",
        message: err.message,
      },
    }, err.status);
  }

  // JSON parse errors from malformed request bodies
  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    return c.json({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid JSON in request body",
      },
    }, 400);
  }

  // Everything else → 500
  const requestId = c.get("requestId");
  console.error("[unhandled]", { requestId, error: err.message, stack: err.stack });
  return c.json({
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message || "Unknown error",
      requestId,
    },
  }, 500);
});

export { app };
