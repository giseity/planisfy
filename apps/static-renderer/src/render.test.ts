import assert from "node:assert/strict";
import test from "node:test";
import {
  forwardedAuthHeaders,
  normalizeStyleUrls,
} from "./render";
import {
  headersForRouteRequest,
  isAllowedApiAssetUrl,
  loadRendererResource,
  RendererPolicyError,
  RendererResourceBudget,
  type RendererLimits,
} from "./resource-loader";

const TEST_LIMITS: RendererLimits = {
  maxRequests: 2,
  maxResourceBytes: 32,
  maxTotalBytes: 48,
  requestTimeoutMs: 1_000,
};

test("normalizeStyleUrls absolutizes API-relative URLs", () => {
  const style = {
    glyphs: "/fonts/v1/{fontstack}/{range}.pbf",
    sources: {
      streets: {
        tiles: ["/tiles/v1/planisfy.basic/{z}/{x}/{y}.mvt"],
      },
    },
  };

  assert.deepEqual(normalizeStyleUrls(style, "http://api:4000"), {
    glyphs: "http://api:4000/fonts/v1/{fontstack}/{range}.pbf",
    sources: {
      streets: {
        tiles: ["http://api:4000/tiles/v1/planisfy.basic/{z}/{x}/{y}.mvt"],
      },
    },
  });
});

test("forwardedAuthHeaders keeps only auth-bearing headers", () => {
  const headers = new Headers({
    "x-api-key": "pk_test",
    authorization: "Bearer test",
    accept: "image/png",
  });

  assert.deepEqual(forwardedAuthHeaders(headers), {
    "x-api-key": "pk_test",
    authorization: "Bearer test",
  });
});

test("headersForRouteRequest forwards auth only to the API origin", () => {
  const requestHeaders = {
    accept: "*/*",
    authorization: "Bearer browser",
    cookie: "browser=test",
    host: "attacker.test",
  };
  const forwardedHeaders = {
    authorization: "Bearer test",
    cookie: "session=test",
  };

  assert.deepEqual(
    headersForRouteRequest(
      "http://api:4000/tiles/v1/demo/0/0/0.mvt",
      requestHeaders,
      forwardedHeaders,
      "http://api:4000",
    ),
    {
      accept: "*/*",
      authorization: "Bearer test",
      cookie: "session=test",
    },
  );

  assert.deepEqual(
    headersForRouteRequest(
      "https://tiles.example.com/0/0/0.mvt",
      requestHeaders,
      forwardedHeaders,
      "http://api:4000",
    ),
    { accept: "*/*" },
  );
});

test("API requests are limited to published asset paths", () => {
  assert.equal(
    isAllowedApiAssetUrl(
      "http://api:4000/styles/v1/acme/basic",
      "http://api:4000",
    ),
    true,
  );
  assert.equal(
    isAllowedApiAssetUrl(
      "http://api:4000/tiles/v1/acme/basic/0/0/0",
      "http://api:4000",
    ),
    true,
  );
  assert.equal(
    isAllowedApiAssetUrl(
      "http://api:4000/api/auth/session",
      "http://api:4000",
    ),
    false,
  );
  assert.equal(
    isAllowedApiAssetUrl(
      "http://api:4000/tiles/%2e%2e/api/auth/session",
      "http://api:4000",
    ),
    false,
  );
});

test("renderer blocks private destinations at the actual request sink", async () => {
  await assert.rejects(
    loadRendererResource({
      requestUrl: "http://127.0.0.1:9/tile.png",
      requestHeaders: { accept: "image/png" },
      forwardedHeaders: { authorization: "Bearer secret" },
      apiBaseUrl: "http://api:4000",
      budget: new RendererResourceBudget(TEST_LIMITS),
    }),
    (error) =>
      error instanceof Error &&
      error.name === "OutboundRequestError" &&
      error.message.includes("private or reserved"),
  );
});

test("renderer budgets enforce request and aggregate response limits", () => {
  const requests = new RendererResourceBudget(TEST_LIMITS);
  requests.beginRequest();
  requests.beginRequest();
  assert.throws(() => requests.beginRequest(), RendererPolicyError);

  const bytes = new RendererResourceBudget(TEST_LIMITS);
  let firstResource = 0;
  firstResource = bytes.consume(firstResource, 30);
  assert.equal(firstResource, 30);
  assert.throws(() => bytes.consume(firstResource, 3), RendererPolicyError);

  const aggregate = new RendererResourceBudget(TEST_LIMITS);
  aggregate.consume(0, 30);
  assert.throws(() => aggregate.consume(0, 19), RendererPolicyError);
});
