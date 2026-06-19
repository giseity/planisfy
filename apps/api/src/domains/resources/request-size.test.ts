import assert from "node:assert/strict";
import test from "node:test";
import { isRequestBodyTooLarge, parseContentLength } from "./request-size";

test("parseContentLength accepts only safe non-negative integers", () => {
  assert.equal(parseContentLength(new Headers({ "content-length": "42" })), 42);
  assert.equal(parseContentLength(new Headers()), null);
  assert.equal(parseContentLength(new Headers({ "content-length": "-1" })), null);
  assert.equal(parseContentLength(new Headers({ "content-length": "1.5" })), null);
  assert.equal(parseContentLength(new Headers({ "content-length": "bad" })), null);
});

test("isRequestBodyTooLarge checks declared request body size", () => {
  assert.equal(
    isRequestBodyTooLarge(new Headers({ "content-length": "101" }), 100),
    true,
  );
  assert.equal(
    isRequestBodyTooLarge(new Headers({ "content-length": "100" }), 100),
    false,
  );
  assert.equal(isRequestBodyTooLarge(new Headers(), 100), false);
});
