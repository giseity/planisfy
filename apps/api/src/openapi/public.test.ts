import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { buildPublicOpenApiDocument } from "./public";

test("serves a public OpenAPI document", async () => {
  const app = new Hono().get("/openapi.json", (c) =>
    c.json(buildPublicOpenApiDocument()),
  );
  const response = await app.request("/openapi.json");
  assert.equal(response.status, 200);

  const spec = await response.json();
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/styles/v1/{owner}/{handle}"]);
  assert.ok(spec.paths["/tiles/v1/{owner}/{handle}.json"]);
  assert.ok(spec.paths["/geocoding/v1/forward"]);
  assert.ok(spec.paths["/directions/v1/{profile}/{coords}"]);
  assert.ok(spec.paths["/static/v1/{owner}/{style}/{center}/{size}"]);
  assert.ok(spec.components.securitySchemes.ApiKeyAuth);
});
