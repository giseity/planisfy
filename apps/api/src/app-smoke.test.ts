import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { healthRoute } from "./domains/health/route";
import { apiKeyMiddleware } from "./middleware/api-key";
import {
  dualAuthMiddleware,
  getBetterAuthSessionCookie,
  optionalAuthMiddleware,
  type AuthEnv,
} from "./middleware/auth";

const healthApp = new Hono();
healthApp.route("/", healthRoute);

const protectedApp = new Hono<AuthEnv>();
protectedApp.use("/directions/*", apiKeyMiddleware, dualAuthMiddleware);
protectedApp.get("/directions/v1/driving/:coordinates", (c) =>
  c.json({ ok: true }),
);

const publishedAssetApp = new Hono<AuthEnv>();
publishedAssetApp.use(
  "/styles/v1/*",
  apiKeyMiddleware,
  optionalAuthMiddleware,
);
publishedAssetApp.get("/styles/v1/:owner/:handle", (c) => c.json({ ok: true }));

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

test("production diagnostics require internal authorization", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;
  process.env.NODE_ENV = "production";
  process.env.INTERNAL_API_SECRET = "diagnostics-secret";

  try {
    const metricsResponse = await healthApp.request("/metrics");
    const detailedResponse = await healthApp.request("/health/detailed");
    const authorizedMetricsResponse = await healthApp.request("/metrics", {
      headers: { "x-internal-secret": "diagnostics-secret" },
    });

    assert.equal(metricsResponse.status, 401);
    assert.equal(detailedResponse.status, 401);
    assert.equal(authorizedMetricsResponse.status, 200);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = previousInternalSecret;
    }
  }
});

test("published map asset routes allow anonymous reads", async () => {
  const response = await publishedAssetApp.request("/styles/v1/acme/basic");
  const body = (await response.json()) as { ok?: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test("non-asset public API routes require an API key or session", async () => {
  const response = await protectedApp.request(
    "/directions/v1/driving/0,0;1,1",
  );
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

test("auth middleware prefers secure session cookie when both names are present", async () => {
  const response = await cookieApp.request("/session-cookie", {
    headers: {
      Cookie:
        "better-auth.session_token=plain-token.signed; __Secure-better-auth.session_token=secure-token.signed",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "secure-token.signed");
});
