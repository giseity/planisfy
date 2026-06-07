import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  executionTargetEnvVars,
  executionTargets,
  workerProfiles,
} from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";
import { customerComputeMutationGate } from "../lib/platform-gates";
import { encryptCredentialPayload } from "../lib/source-credentials";
import {
  encryptExecutionSecret,
  estimateProcessingDuration,
  maskSecretValue,
  normalizeEnvName,
  type ExecutionTargetProvider,
} from "../lib/execution-targets";

export const executionTargetsRoute = new Hono<AuthEnv>();

const providerSchema = z.enum(["local", "aws_batch", "gcp_batch"]);
const authModeSchema = z.enum(["federated", "static", "external"]);
const envNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

const targetSchema = z.object({
  name: z.string().min(1).max(128),
  provider: providerSchema.default("local"),
  authMode: authModeSchema.default("federated"),
  region: z.string().min(1).max(128).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  credentials: z.record(z.string(), z.unknown()).optional(),
});

const targetPatchSchema = targetSchema.partial();

const envVarSchema = z.object({
  name: envNameSchema,
  value: z.string().max(32_000),
  isSecret: z.boolean().default(true),
  description: z.string().max(1000).optional(),
});

const envVarPatchSchema = z.object({
  value: z.string().max(32_000).optional(),
  isSecret: z.boolean().optional(),
  description: z.string().max(1000).nullable().optional(),
});

const workerProfileSchema = z.object({
  name: z.string().min(1).max(128),
  image: z.string().max(512).optional(),
  command: z.array(z.string().max(512)).default([]),
  args: z.array(z.string().max(512)).default([]),
  cpu: z.number().int().min(1).max(128).optional(),
  memoryMb: z.number().int().min(128).max(1_048_576).optional(),
  timeoutSeconds: z.number().int().min(1).max(604_800).optional(),
  concurrency: z.number().int().min(1).max(10_000).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

const workerProfilePatchSchema = workerProfileSchema.partial();

const estimateSchema = z
  .object({
    executionTargetId: z.string().uuid().optional(),
    workerProfileId: z.string().uuid().optional(),
    sourceSizeBytes: z.number().int().min(0).optional(),
    featureCount: z.number().int().min(0).optional(),
    minZoom: z.number().int().min(0).max(24).optional(),
    maxZoom: z.number().int().min(0).max(24).optional(),
  })
  .refine(
    (data) =>
      data.minZoom === undefined ||
      data.maxZoom === undefined ||
      data.minZoom <= data.maxZoom,
    { message: "minZoom must be less than or equal to maxZoom" },
  );

executionTargetsRoute.get("/execution-targets", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") {
    return c.json({ data: [] });
  }

  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(executionTargets)
    .where(
      and(
        eq(executionTargets.accountId, accountId),
        isNull(executionTargets.deletedAt),
      ),
    )
    .orderBy(desc(executionTargets.createdAt));

  return c.json({ data: rows.map(toPublicTarget) });
});

executionTargetsRoute.post("/execution-targets", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const parsed = targetSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const encryptedCredentials = encryptCredentials(parsed.data.credentials ?? {});
  if (encryptedCredentials instanceof Response) return encryptedCredentials;

  const [created] = await db
    .insert(executionTargets)
    .values({
      accountId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      authMode: parsed.data.authMode,
      region: parsed.data.region ?? null,
      config: parsed.data.config,
      encryptedCredentials,
    })
    .returning();

  return c.json({ data: toPublicTarget(created!) }, 201);
});

executionTargetsRoute.patch("/execution-targets/:id", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const parsed = targetPatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const existing = await findTarget(accountId, id);
  if (!existing) return notFound(c, "Execution target not found");

  const values: Partial<typeof executionTargets.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) values.name = parsed.data.name;
  if (parsed.data.provider !== undefined) values.provider = parsed.data.provider;
  if (parsed.data.authMode !== undefined) values.authMode = parsed.data.authMode;
  if (parsed.data.region !== undefined) values.region = parsed.data.region ?? null;
  if (parsed.data.config !== undefined) values.config = parsed.data.config;
  if (parsed.data.credentials !== undefined) {
    const encryptedCredentials = encryptCredentials(parsed.data.credentials);
    if (encryptedCredentials instanceof Response) return encryptedCredentials;
    values.encryptedCredentials = encryptedCredentials;
  }

  const [updated] = await db
    .update(executionTargets)
    .set(values)
    .where(eq(executionTargets.id, id))
    .returning();

  return c.json({ data: toPublicTarget(updated!) });
});

executionTargetsRoute.delete("/execution-targets/:id", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const existing = await findTarget(accountId, id);
  if (!existing) return notFound(c, "Execution target not found");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(executionTargetEnvVars)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(executionTargetEnvVars.executionTargetId, id));
    await tx
      .update(executionTargets)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(executionTargets.id, id));
  });

  return c.json({ data: { id, deleted: true } });
});

executionTargetsRoute.get("/execution-targets/:id/env", async (c) => {
  const accountId = c.get("ownerId");
  const targetId = c.req.param("id");
  const existing = await findTarget(accountId, targetId);
  if (!existing) return notFound(c, "Execution target not found");

  const rows = await db
    .select()
    .from(executionTargetEnvVars)
    .where(
      and(
        eq(executionTargetEnvVars.accountId, accountId),
        eq(executionTargetEnvVars.executionTargetId, targetId),
        isNull(executionTargetEnvVars.deletedAt),
      ),
    )
    .orderBy(executionTargetEnvVars.name);

  return c.json({ data: rows.map(toPublicEnvVar) });
});

executionTargetsRoute.post("/execution-targets/:id/env", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const targetId = c.req.param("id");
  const existing = await findTarget(accountId, targetId);
  if (!existing) return notFound(c, "Execution target not found");

  const parsed = envVarSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const encryptedValue = encryptValue(parsed.data.value);
  if (encryptedValue instanceof Response) return encryptedValue;

  const [created] = await db
    .insert(executionTargetEnvVars)
    .values({
      accountId,
      executionTargetId: targetId,
      name: normalizeEnvName(parsed.data.name),
      encryptedValue,
      isSecret: parsed.data.isSecret,
      description: parsed.data.description ?? null,
    })
    .returning();

  return c.json({ data: toPublicEnvVar(created!) }, 201);
});

executionTargetsRoute.patch("/execution-targets/:id/env/:name", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const targetId = c.req.param("id");
  const name = normalizeEnvName(c.req.param("name"));
  const existing = await findTarget(accountId, targetId);
  if (!existing) return notFound(c, "Execution target not found");

  const parsed = envVarPatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const row = await findEnvVar(accountId, targetId, name);
  if (!row) return notFound(c, "Environment variable not found");

  const values: Partial<typeof executionTargetEnvVars.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.value !== undefined) {
    const encryptedValue = encryptValue(parsed.data.value);
    if (encryptedValue instanceof Response) return encryptedValue;
    values.encryptedValue = encryptedValue;
  }
  if (parsed.data.isSecret !== undefined) values.isSecret = parsed.data.isSecret;
  if (parsed.data.description !== undefined) {
    values.description = parsed.data.description;
  }

  const [updated] = await db
    .update(executionTargetEnvVars)
    .set(values)
    .where(eq(executionTargetEnvVars.id, row.id))
    .returning();

  return c.json({ data: toPublicEnvVar(updated!) });
});

executionTargetsRoute.delete("/execution-targets/:id/env/:name", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const targetId = c.req.param("id");
  const name = normalizeEnvName(c.req.param("name"));
  const existing = await findTarget(accountId, targetId);
  if (!existing) return notFound(c, "Execution target not found");

  const row = await findEnvVar(accountId, targetId, name);
  if (!row) return notFound(c, "Environment variable not found");

  await db
    .update(executionTargetEnvVars)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(executionTargetEnvVars.id, row.id));

  return c.json({ data: { name, deleted: true } });
});

executionTargetsRoute.get("/worker-profiles", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") {
    return c.json({ data: [] });
  }

  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(workerProfiles)
    .where(and(eq(workerProfiles.accountId, accountId), isNull(workerProfiles.deletedAt)))
    .orderBy(desc(workerProfiles.createdAt));

  return c.json({ data: rows });
});

executionTargetsRoute.post("/worker-profiles", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const parsed = workerProfileSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [created] = await db
    .insert(workerProfiles)
    .values({
      accountId,
      name: parsed.data.name,
      image: parsed.data.image ?? null,
      command: parsed.data.command,
      args: parsed.data.args,
      cpu: parsed.data.cpu ?? null,
      memoryMb: parsed.data.memoryMb ?? null,
      timeoutSeconds: parsed.data.timeoutSeconds ?? null,
      concurrency: parsed.data.concurrency ?? null,
      config: parsed.data.config,
    })
    .returning();

  return c.json({ data: created }, 201);
});

executionTargetsRoute.patch("/worker-profiles/:id", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const parsed = workerProfilePatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const existing = await findWorkerProfile(accountId, id);
  if (!existing) return notFound(c, "Worker profile not found");

  const values: Partial<typeof workerProfiles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name !== undefined) values.name = parsed.data.name;
  if (parsed.data.image !== undefined) values.image = parsed.data.image ?? null;
  if (parsed.data.command !== undefined) values.command = parsed.data.command;
  if (parsed.data.args !== undefined) values.args = parsed.data.args;
  if (parsed.data.cpu !== undefined) values.cpu = parsed.data.cpu ?? null;
  if (parsed.data.memoryMb !== undefined) values.memoryMb = parsed.data.memoryMb ?? null;
  if (parsed.data.timeoutSeconds !== undefined) {
    values.timeoutSeconds = parsed.data.timeoutSeconds ?? null;
  }
  if (parsed.data.concurrency !== undefined) {
    values.concurrency = parsed.data.concurrency ?? null;
  }
  if (parsed.data.config !== undefined) values.config = parsed.data.config;

  const [updated] = await db
    .update(workerProfiles)
    .set(values)
    .where(eq(workerProfiles.id, id))
    .returning();

  return c.json({ data: updated });
});

executionTargetsRoute.delete("/worker-profiles/:id", async (c) => {
  if (env.DEPLOYMENT_MODE === "managed") return managedComputeUnavailable(c);

  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const existing = await findWorkerProfile(accountId, id);
  if (!existing) return notFound(c, "Worker profile not found");

  await db
    .update(workerProfiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(workerProfiles.id, id));

  return c.json({ data: { id, deleted: true } });
});

executionTargetsRoute.post("/processing-jobs/estimate", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = estimateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  if (
    env.DEPLOYMENT_MODE === "managed" &&
    (parsed.data.executionTargetId || parsed.data.workerProfileId)
  ) {
    return managedComputeUnavailable(c);
  }

  const target = parsed.data.executionTargetId
    ? await findTarget(accountId, parsed.data.executionTargetId)
    : null;
  if (parsed.data.executionTargetId && !target) {
    return notFound(c, "Execution target not found");
  }

  const profile = parsed.data.workerProfileId
    ? await findWorkerProfile(accountId, parsed.data.workerProfileId)
    : null;
  if (parsed.data.workerProfileId && !profile) {
    return notFound(c, "Worker profile not found");
  }

  return c.json({
    data: estimateProcessingDuration({
      provider: (target?.provider as ExecutionTargetProvider | undefined) ?? "local",
      sourceSizeBytes: parsed.data.sourceSizeBytes,
      featureCount: parsed.data.featureCount,
      minZoom: parsed.data.minZoom,
      maxZoom: parsed.data.maxZoom,
      cpu: profile?.cpu,
      memoryMb: profile?.memoryMb,
    }),
  });
});

async function findTarget(accountId: string, id: string) {
  const [row] = await db
    .select()
    .from(executionTargets)
    .where(
      and(
        eq(executionTargets.id, id),
        eq(executionTargets.accountId, accountId),
        isNull(executionTargets.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findEnvVar(accountId: string, targetId: string, name: string) {
  const [row] = await db
    .select()
    .from(executionTargetEnvVars)
    .where(
      and(
        eq(executionTargetEnvVars.accountId, accountId),
        eq(executionTargetEnvVars.executionTargetId, targetId),
        eq(executionTargetEnvVars.name, name),
        isNull(executionTargetEnvVars.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findWorkerProfile(accountId: string, id: string) {
  const [row] = await db
    .select()
    .from(workerProfiles)
    .where(
      and(
        eq(workerProfiles.id, id),
        eq(workerProfiles.accountId, accountId),
        isNull(workerProfiles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function toPublicTarget(target: typeof executionTargets.$inferSelect) {
  return {
    ...target,
    encryptedCredentials: undefined,
    hasCredentials: hasEncryptedPayload(target.encryptedCredentials),
  };
}

function toPublicEnvVar(row: typeof executionTargetEnvVars.$inferSelect) {
  return {
    id: row.id,
    accountId: row.accountId,
    executionTargetId: row.executionTargetId,
    name: row.name,
    value: maskSecretValue(true),
    isSecret: row.isSecret,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function encryptCredentials(payload: Record<string, unknown>) {
  if (Object.keys(payload).length === 0) return {};
  try {
    return encryptCredentialPayload(payload, credentialSecret());
  } catch (err) {
    return encryptionError(err);
  }
}

function encryptValue(value: string) {
  try {
    return encryptExecutionSecret(value, credentialSecret());
  } catch (err) {
    return encryptionError(err);
  }
}

function credentialSecret() {
  return (
    env.SOURCE_CREDENTIAL_ENCRYPTION_KEY ??
    env.BETTER_AUTH_SECRET ??
    env.INTERNAL_API_SECRET
  );
}

function hasEncryptedPayload(payload: unknown) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "ciphertext" in payload &&
    typeof (payload as { ciphertext?: unknown }).ciphertext === "string"
  );
}

function encryptionError(err: unknown) {
  return Response.json(
    {
      error: {
        code: "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED",
        message: err instanceof Error ? err.message : String(err),
      },
    },
    { status: 500 },
  );
}

function validationError(c: Context, error: z.ZodError) {
  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.flatten(),
      },
    },
    400,
  );
}

function notFound(c: Context, message: string) {
  return c.json({ error: { code: "NOT_FOUND", message } }, 404);
}

function managedComputeUnavailable(c: Context) {
  const denial = customerComputeMutationGate(env.DEPLOYMENT_MODE);
  if (!denial) {
    throw new Error("managedComputeUnavailable called outside managed mode");
  }

  return c.json(
    {
      error: {
        code: denial.code,
        message: denial.message,
      },
    },
    denial.status,
  );
}
