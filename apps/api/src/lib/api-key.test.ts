import assert from "node:assert/strict";
import test from "node:test";
import {
  isRequestOriginAllowed,
  normalizeAllowedDomains,
  requiredScopeForPath,
} from "./api-key";

test("normalizes API key allowed domains", () => {
  const result = normalizeAllowedDomains([
    " HTTPS://Example.COM ",
    "*.Example.com",
    "example.com",
    "bad/path",
    "",
  ]);

  assert.deepEqual(result.domains, ["example.com", "*.example.com"]);
  assert.deepEqual(result.errors, ["bad/path", ""]);
});

test("checks API key request origins against exact and wildcard domains", () => {
  assert.equal(
    isRequestOriginAllowed("https://app.example.com", ["*.example.com"]),
    true,
  );
  assert.equal(
    isRequestOriginAllowed("https://example.com", ["*.example.com"]),
    true,
  );
  assert.equal(
    isRequestOriginAllowed("https://evil-example.com", ["*.example.com"]),
    false,
  );
  assert.equal(
    isRequestOriginAllowed("https://console.planisfy.com/path", [
      "console.planisfy.com",
    ]),
    true,
  );
});

test("domain restricted API keys require a valid origin", () => {
  assert.equal(isRequestOriginAllowed(undefined, ["example.com"]), false);
  assert.equal(isRequestOriginAllowed("not a url", ["example.com"]), false);
  assert.equal(isRequestOriginAllowed(undefined, []), true);
});

test("required scopes map public API paths", () => {
  assert.equal(requiredScopeForPath("/tiles/v1/main/0/0/0.pbf"), "tiles:read");
  assert.equal(requiredScopeForPath("/styles/v1/demo/basic"), "styles:read");
  assert.equal(requiredScopeForPath("/directions/v1/driving"), "directions");
});
