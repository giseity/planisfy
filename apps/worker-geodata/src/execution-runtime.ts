import { createDecipheriv, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  executionTargetEnvVars,
  executionTargets,
  workerProfiles,
} from "@planisfy/database";

export interface LocalExecutionRuntime {
  executionTarget: {
    id: string;
    name: string;
    provider: "local";
    config: Record<string, unknown>;
  } | null;
  workerProfile: {
    id: string;
    name: string;
    image: string | null;
    command: string[];
    args: string[];
    cpu: number | null;
    memoryMb: number | null;
    timeoutSeconds: number | null;
    concurrency: number | null;
    config: Record<string, unknown>;
  } | null;
  env: Record<string, string>;
}

interface EncryptedEnvelope {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  tag: string;
  ciphertext: string;
}

type DatabaseClient = typeof db;

export async function resolveLocalExecutionRuntime(
  params: {
    accountId: string;
    executionTargetId?: string | null;
    workerProfileId?: string | null;
    secret?: string;
  },
  database: DatabaseClient = db,
): Promise<LocalExecutionRuntime> {
  const target = params.executionTargetId
    ? await fetchExecutionTarget(params.accountId, params.executionTargetId, database)
    : null;
  if (params.executionTargetId && !target) {
    throw new Error("Execution target is unavailable or no longer exists");
  }
  if (target && target.provider !== "local") {
    throw new Error(
      `Execution target ${target.name} uses ${target.provider}; this local worker can only run local targets`,
    );
  }

  const profile = params.workerProfileId
    ? await fetchWorkerProfile(params.accountId, params.workerProfileId, database)
    : null;
  if (params.workerProfileId && !profile) {
    throw new Error("Worker profile is unavailable or no longer exists");
  }

  const envVars = target
    ? await database
        .select()
        .from(executionTargetEnvVars)
        .where(
          and(
            eq(executionTargetEnvVars.accountId, params.accountId),
            eq(executionTargetEnvVars.executionTargetId, target.id),
            isNull(executionTargetEnvVars.deletedAt),
          ),
        )
    : [];

  return {
    executionTarget: target
      ? {
          id: target.id,
          name: target.name,
          provider: "local",
          config: asRecord(target.config),
        }
      : null,
    workerProfile: profile
      ? {
          id: profile.id,
          name: profile.name,
          image: profile.image,
          command: asStringArray(profile.command),
          args: asStringArray(profile.args),
          cpu: profile.cpu,
          memoryMb: profile.memoryMb,
          timeoutSeconds: profile.timeoutSeconds,
          concurrency: profile.concurrency,
          config: asRecord(profile.config),
        }
      : null,
    env: Object.fromEntries(
      envVars.map((envVar) => [
        envVar.name,
        decryptExecutionValue(envVar.encryptedValue, params.secret),
      ]),
    ),
  };
}

export function decryptExecutionValue(
  envelope: unknown,
  secret: string | undefined,
): string {
  const payload = decryptEnvelope(envelope as EncryptedEnvelope, secret);
  return typeof payload.value === "string" ? payload.value : "";
}

async function fetchExecutionTarget(
  accountId: string,
  targetId: string,
  database: DatabaseClient,
) {
  const [target] = await database
    .select()
    .from(executionTargets)
    .where(
      and(
        eq(executionTargets.id, targetId),
        eq(executionTargets.accountId, accountId),
        isNull(executionTargets.deletedAt),
      ),
    )
    .limit(1);
  return target ?? null;
}

async function fetchWorkerProfile(
  accountId: string,
  profileId: string,
  database: DatabaseClient,
) {
  const [profile] = await database
    .select()
    .from(workerProfiles)
    .where(
      and(
        eq(workerProfiles.id, profileId),
        eq(workerProfiles.accountId, accountId),
        isNull(workerProfiles.deletedAt),
      ),
    )
    .limit(1);
  return profile ?? null;
}

function decryptEnvelope(
  envelope: EncryptedEnvelope,
  secret: string | undefined,
): Record<string, unknown> {
  if (envelope.v !== 1 || envelope.alg !== "AES-256-GCM") {
    throw new Error("Unsupported execution secret envelope");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    credentialEncryptionKey(secret),
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf-8")) as Record<string, unknown>;
}

function credentialEncryptionKey(secret: string | undefined): Buffer {
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
