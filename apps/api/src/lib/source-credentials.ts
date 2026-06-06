import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export interface EncryptedCredentialEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  tag: string;
  ciphertext: string;
}

export function encryptCredentialPayload(
  payload: Record<string, unknown>,
  secret: string | undefined,
): EncryptedCredentialEnvelope {
  const key = credentialEncryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "AES-256-GCM",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptCredentialPayload(
  envelope: EncryptedCredentialEnvelope,
  secret: string | undefined,
): Record<string, unknown> {
  if (envelope.v !== 1 || envelope.alg !== "AES-256-GCM") {
    throw new Error("Unsupported source credential envelope");
  }

  const key = credentialEncryptionKey(secret);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf-8")) as Record<string, unknown>;
}

export function credentialEncryptionKey(secret: string | undefined): Buffer {
  if (!secret) {
    throw new Error(
      "SOURCE_CREDENTIAL_ENCRYPTION_KEY or BETTER_AUTH_SECRET is required",
    );
  }

  if (secret.startsWith("base64:")) {
    const decoded = Buffer.from(secret.slice("base64:".length), "base64");
    if (decoded.length !== 32) {
      throw new Error("SOURCE_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes");
    }
    return decoded;
  }

  return createHash("sha256").update(secret).digest();
}
