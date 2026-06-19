import assert from "node:assert/strict";
import test from "node:test";
import { encryptCredentialPayload } from "@planisfy/credentials";
import { decryptExecutionValue } from "./execution-runtime";

test("decryptExecutionValue reads API-compatible encrypted env values", () => {
  const envelope = encryptCredentialPayload(
    { value: "runtime-token" },
    "test-secret",
  );

  assert.equal(decryptExecutionValue(envelope, "test-secret"), "runtime-token");
});
