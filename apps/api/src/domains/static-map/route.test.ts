import assert from "node:assert/strict";
import test from "node:test";
import { staticMapResponseHeaders } from "./route";

test("credentialed static renders are never publicly cacheable", () => {
  const result = staticMapResponseHeaders(
    new Headers({
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    }),
    { authorization: "Bearer private-session" },
  );

  assert.deepEqual(result, {
    contentType: "image/png",
    cacheControl: "private, no-store",
    vary: "Authorization, Cookie, X-API-Key",
  });
});

test("anonymous static renders preserve an explicit public policy", () => {
  const result = staticMapResponseHeaders(
    new Headers({ "cache-control": "public, max-age=300" }),
    {},
  );

  assert.equal(result.cacheControl, "public, max-age=300");
});
