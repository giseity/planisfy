import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { decryptExecutionValue } from "./execution-runtime";

test("decryptExecutionValue reads API-compatible encrypted env values", () => {
  const envelope = encryptValue("runtime-token", "test-secret");

  assert.equal(decryptExecutionValue(envelope, "test-secret"), "runtime-token");
});

function encryptValue(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify({ value }), "utf-8")),
    cipher.final(),
  ]);
  return {
    v: 1 as const,
    alg: "AES-256-GCM" as const,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}
