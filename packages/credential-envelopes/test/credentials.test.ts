import { describe, expect, it } from "vitest";
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "../src";

describe("credential envelopes", () => {
  it("encrypts and decrypts payloads with the same secret", () => {
    const payload = {
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    const envelope = encryptCredentialPayload(payload, "test-secret");

    expect(envelope.alg).toBe("AES-256-GCM");
    expect(envelope.v).toBe(1);
    expect(typeof envelope.ciphertext).toBe("string");
    expect(envelope.ciphertext).not.toMatch(/secret/);
    expect(decryptCredentialPayload(envelope, "test-secret")).toEqual(payload);
  });

  it("supports base64 32-byte keys", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const envelope = encryptCredentialPayload({ token: "abc" }, `base64:${key}`);

    expect(decryptCredentialPayload(envelope, `base64:${key}`)).toEqual({
      token: "abc",
    });
  });

  it("requires a configured secret", () => {
    expect(() =>
      encryptCredentialPayload({ token: "abc" }, undefined),
    ).toThrow(/required/);
  });
});
