import assert from "node:assert/strict";
import test from "node:test";
import { canonicalStylePaths } from "./style-contract";

test("canonical style paths encode the owning account and style handle", () => {
  assert.deepEqual(
    canonicalStylePaths({
      ownerHandle: "acme maps",
      styleHandle: "streets/basic",
      isPublic: true,
      publishedVersion: 4,
    }),
    {
      publicPath: "/styles/v1/acme%20maps/streets%2Fbasic",
      publishedVersionPath:
        "/styles/v1/acme%20maps/streets%2Fbasic@4",
    },
  );
});

test("draft styles do not advertise live publication paths", () => {
  assert.deepEqual(
    canonicalStylePaths({
      ownerHandle: "acme",
      styleHandle: "draft",
      isPublic: false,
      publishedVersion: null,
    }),
    { publicPath: null, publishedVersionPath: null },
  );
});
