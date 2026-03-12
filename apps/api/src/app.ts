import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware, type AuthEnv } from "./middleware/auth";
import { healthRoute } from "./routes/health";
import { stylesRoute } from "./routes/styles";
import { auditRoute } from "./routes/audit";
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

// ── Protected routes (require session) ──────────────────────────────────────
app.use("/console/*", authMiddleware);
app.route("/console", stylesRoute);
app.route("/console", auditRoute);

export { app };
