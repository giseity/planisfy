import assert from "node:assert/strict";
import test from "node:test";
import { isInternalRequestAuthorized } from "./internal-auth";

function withEnv<T>(
  env: { NODE_ENV?: string; INTERNAL_API_SECRET?: string },
  fn: () => T
): T {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.INTERNAL_API_SECRET;

  if (env.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = env.NODE_ENV;
  }

  if (env.INTERNAL_API_SECRET === undefined) {
    delete process.env.INTERNAL_API_SECRET;
  } else {
    process.env.INTERNAL_API_SECRET = env.INTERNAL_API_SECRET;
  }

  try {
    return fn();
  } finally {
    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = oldNodeEnv;
    }

    if (oldSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = oldSecret;
    }
  }
}

test("internal requests are allowed without a secret outside production", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(isInternalRequestAuthorized(new Headers()), true);
  });
});

test("production internal requests require a configured matching secret", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(isInternalRequestAuthorized(new Headers()), false);
  });

  withEnv({ NODE_ENV: "production", INTERNAL_API_SECRET: "secret" }, () => {
    assert.equal(isInternalRequestAuthorized(new Headers()), false);
    assert.equal(
      isInternalRequestAuthorized(new Headers({ "X-Internal-Secret": "secret" })),
      true
    );
  });
});
