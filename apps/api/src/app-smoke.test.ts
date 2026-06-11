import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { apiKeyMiddleware } from "./middleware/api-key";
import {
  dualAuthMiddleware,
  getBetterAuthSessionCookie,
  type AuthEnv,
} from "./middleware/auth";

const healthApp = new Hono();
healthApp.route("/", healthRoute);

const protectedApp = new Hono<AuthEnv>();
protectedApp.use("/styles/v1/*", apiKeyMiddleware, dualAuthMiddleware);
protectedApp.get("/styles/v1/:owner/:handle", (c) => c.json({ ok: true }));

const cookieApp = new Hono();
cookieApp.get("/session-cookie", (c) =>
  c.text(getBetterAuthSessionCookie(c) ?? ""),
);

test("health endpoint returns API readiness", async () => {
  const response = await healthApp.request("/health");
  const body = (await response.json()) as { status?: string; timestamp?: string };

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(typeof body.timestamp, "string");
});

test("metrics endpoint returns Prometheus text", async () => {
  const response = await healthApp.request("/metrics");
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  assert.match(body, /planisfy_api_info/);
});

test("public API routes require an API key or session", async () => {
  const response = await protectedApp.request("/styles/v1/acme/basic");
  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };

  assert.equal(response.status, 401);
  assert.equal(body.error?.code, "UNAUTHORIZED");
  assert.match(body.error?.message ?? "", /API key or session/);
});

test("auth middleware accepts secure Better Auth session cookie name", async () => {
  const response = await cookieApp.request("/session-cookie", {
    headers: {
      Cookie: "__Secure-better-auth.session_token=secure-token.signed",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "secure-token.signed");
});
