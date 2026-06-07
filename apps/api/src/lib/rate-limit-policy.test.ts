import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequestsPerMinute } from "./rate-limit-policy";

test("normalizes runtime request-per-minute limits", () => {
  assert.equal(normalizeRequestsPerMinute(120), 120);
  assert.equal(normalizeRequestsPerMinute(12.8), 12);
  assert.equal(normalizeRequestsPerMinute(0), 1);
  assert.equal(normalizeRequestsPerMinute(Number.POSITIVE_INFINITY), Infinity);
});
