import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "./source-credentials";

test("source credential payloads are encrypted and decryptable with the same secret", () => {
  const payload = {
    accessKeyId: "key",
    secretAccessKey: "secret",
  };
  const envelope = encryptCredentialPayload(payload, "test-secret");

  assert.equal(envelope.alg, "AES-256-GCM");
  assert.equal(envelope.v, 1);
  assert.equal(typeof envelope.ciphertext, "string");
  assert.doesNotMatch(envelope.ciphertext, /secret/);
  assert.deepEqual(decryptCredentialPayload(envelope, "test-secret"), payload);
});

test("source credential encryption supports base64 32-byte keys", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const envelope = encryptCredentialPayload({ token: "abc" }, `base64:${key}`);

  assert.deepEqual(decryptCredentialPayload(envelope, `base64:${key}`), {
    token: "abc",
  });
});

test("source credential encryption requires a configured secret", () => {
  assert.throws(
    () => encryptCredentialPayload({ token: "abc" }, undefined),
    /required/,
  );
});
