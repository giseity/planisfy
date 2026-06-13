import assert from "node:assert/strict";
import test from "node:test";
import { forwardedAuthHeaders, normalizeStyleUrls } from "./render";

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
