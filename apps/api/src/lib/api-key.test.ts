import assert from "node:assert/strict";
import test from "node:test";
import {
  generateApiKey,
  getEndpointCategory,
  getEndpointCost,
  hashKey,
  requiredScopeForPath,
} from "./api-key";

test("generateApiKey returns a public id, full key, and matching hash", () => {
  const key = generateApiKey();

  assert.match(key.id, /^pk_[a-f0-9]{16}$/);
  assert.match(key.fullKey, /^pk_[a-f0-9]{16}_[a-f0-9]{64}$/);
  assert.equal(key.keyHash, hashKey(key.fullKey));
});

test("endpoint helpers classify Mapbox-compatible API paths", () => {
  assert.equal(getEndpointCategory("/tiles/v1/basic/0/0/0.pbf"), "tiles");
  assert.equal(getEndpointCost("/directions/v1/driving/0,0;1,1"), 10);
  assert.equal(requiredScopeForPath("/fonts/v1/open-sans/0-255.pbf"), "tiles:read");
  assert.equal(requiredScopeForPath("/matrix/v1/driving/0,0;1,1"), "directions");
  assert.equal(requiredScopeForPath("/unknown/path"), null);
});
