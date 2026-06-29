import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { Hono, type Context } from "hono";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  rootAgentNodeTokens,
  rootAgentRegistrationTokens,
  routingGraphArtifacts,
  routingGraphBuildLogs,
  routingGraphBuilds,
  storageObjects,
  workerNodes,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";

type AgentEnv = {
  Variables: {
    accountId: string;
    workerNodeId: string;
  };
};

export const rootAgentRoute = new Hono<AgentEnv>();

const registerSchema = z.object({
  registrationToken: z.string().min(1),
  hostname: z.string().max(255).optional(),
  capabilities: z.array(z.string().min(1).max(128)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const buildStateSchema = z.object({
  status: z.enum([
    "preparing",
    "downloading_source",
    "building_admins",
    "building_tiles",
    "packaging",
    "uploading",
    "succeeded",
    "failed",
    "canceled",
  ]),
  progress: z.number().int().min(0).max(100).optional(),
  message: z.string().max(4000).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().max(128).optional(),
  errorMessage: z.string().max(4000).optional(),
});

const activationStateSchema = z.object({
  activationStatus: z.enum(["active", "failed"]),
  message: z.string().max(4000).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().max(4000).optional(),
});

const logSchema = z.object({
  entries: z
    .array(
      z.object({
        level: z.string().min(1).max(16).default("info"),
        message: z.string().min(1).max(20_000),
        metadata: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(100),
});

const artifactKindSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

const artifactUploadSessionSchema = z.object({
  kind: artifactKindSchema.default("valhalla_graph"),
  fileName: z.string().min(1).max(256),
  size: z.number().int().nonnegative(),
  checksumSha256: z.string().length(64).regex(/^[a-f0-9]+$/i).optional(),
  contentType: z.string().min(1).max(128).default("application/gzip"),
  manifest: z.record(z.string(), z.unknown()).default({}),
});

const artifactFinalizeSchema = z.object({
  kind: artifactKindSchema.default("valhalla_graph"),
  fileName: z.string().min(1).max(256),
  size: z.number().int().nonnegative(),
  checksumSha256: z.string().length(64).regex(/^[a-f0-9]+$/i).optional(),
  contentType: z.string().min(1).max(128).default("application/gzip"),
  manifest: z.record(z.string(), z.unknown()).default({}),
  storage: z.object({
    provider: z.enum(["s3", "r2"]),
    bucket: z.string().min(1).max(256),
    key: z.string().min(1),
    uploadId: z.string().min(1),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(10_000),
          eTag: z.string().min(1).max(256),
        }),
      )
      .min(1)
      .max(10_000),
  }),
});

rootAgentRoute.post("/root-agent/register", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const registrationHash = hashToken(parsed.data.registrationToken);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [registration] = await tx
      .select()
      .from(rootAgentRegistrationTokens)
      .where(
        and(
          eq(rootAgentRegistrationTokens.tokenHash, registrationHash),
          isNull(rootAgentRegistrationTokens.usedAt),
          gt(rootAgentRegistrationTokens.expiresAt, now),
        ),
      )
      .limit(1);
    if (!registration) return null;

    const [node] = await tx
      .insert(workerNodes)
      .values({
        accountId: registration.accountId,
        name: registration.name,
        kind: registration.kind,
        status: "healthy",
        validation: {
          ok: true,
          checks: [{ id: "agent-registration", status: "healthy" }],
        },
        metadata: {
          ...asRecord(registration.metadata),
          ...parsed.data.metadata,
          hostname: parsed.data.hostname ?? null,
          capabilities: parsed.data.capabilities,
          agentManaged: true,
        },
        lastSeenAt: now,
      })
      .returning();
    if (!node) return null;

    const agentToken = `pat_${randomBytes(32).toString("base64url")}`;
    await tx.insert(rootAgentNodeTokens).values({
      accountId: registration.accountId,
      workerNodeId: node.id,
      tokenHash: hashToken(agentToken),
      lastUsedAt: now,
    });
    await tx
      .update(rootAgentRegistrationTokens)
      .set({ usedAt: now, createdWorkerNodeId: node.id })
      .where(eq(rootAgentRegistrationTokens.id, registration.id));
    return { node, agentToken };
  });

  if (!result) {
    return c.json(
      {
        error: {
          code: "INVALID_REGISTRATION_TOKEN",
          message: "Registration token is invalid, expired, or already used.",
        },
      },
      401,
    );
  }

  return c.json({
    data: {
      workerNode: result.node,
      agentToken: result.agentToken,
    },
  });
});

rootAgentRoute.use("/root-agent/*", async (c, next) => {
  if (c.req.path === "/root-agent/register") {
    await next();
    return;
  }
  const auth = await authenticateAgent(c);
  if (!auth.ok) return auth.response;
  c.set("accountId", auth.accountId);
  c.set("workerNodeId", auth.workerNodeId);
  await next();
});

rootAgentRoute.post("/root-agent/heartbeat", async (c) => {
  const body = await readJsonObject(c);
  const now = new Date();
  const [node] = await db
    .update(workerNodes)
    .set({
      status: "healthy",
      lastSeenAt: now,
      validation: {
        ok: true,
        checks: [{ id: "agent-heartbeat", status: "healthy" }],
      },
      metadata: { ...body, agentManaged: true },
      updatedAt: now,
    })
    .where(eq(workerNodes.id, c.get("workerNodeId")))
    .returning();
  return c.json({ data: node });
});

rootAgentRoute.get("/root-agent/jobs/next", async (c) => {
  const accountId = c.get("accountId");
  const workerNodeId = c.get("workerNodeId");
  const now = new Date();

  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.accountId, accountId),
        eq(routingGraphBuilds.workerNodeId, workerNodeId),
        eq(routingGraphBuilds.status, "queued"),
        isNull(routingGraphBuilds.deletedAt),
      ),
    )
    .orderBy(routingGraphBuilds.createdAt)
    .limit(1);
  if (build) {
    const [claimed] = await db
      .update(routingGraphBuilds)
      .set({ status: "assigned", assignedAt: now, updatedAt: now })
      .where(eq(routingGraphBuilds.id, build.id))
      .returning();
    await appendLog(build.id, "info", "Build claimed by root agent", { workerNodeId });
    return c.json({ data: { kind: "routing_graph_build", build: claimed } });
  }

  const [activation] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.accountId, accountId),
        eq(routingGraphBuilds.activationWorkerNodeId, workerNodeId),
        eq(routingGraphBuilds.status, "succeeded"),
        eq(routingGraphBuilds.activationStatus, "activation_requested"),
        isNull(routingGraphBuilds.deletedAt),
      ),
    )
    .orderBy(routingGraphBuilds.updatedAt)
    .limit(1);
  if (activation) {
    const [claimed] = await db
      .update(routingGraphBuilds)
      .set({ activationStatus: "activating", updatedAt: now })
      .where(eq(routingGraphBuilds.id, activation.id))
      .returning();
    const artifacts = await db
      .select()
      .from(routingGraphArtifacts)
      .where(eq(routingGraphArtifacts.buildId, activation.id));
    await appendLog(activation.id, "info", "Activation claimed by root agent", {
      workerNodeId,
    });
    return c.json({
      data: { kind: "routing_graph_activation", build: claimed, artifacts },
    });
  }

  return c.json({ data: null });
});

rootAgentRoute.get("/root-agent/jobs/:id/cancel", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  return c.json({ data: { cancelRequested: Boolean(build.cancelRequestedAt) } });
});

rootAgentRoute.post("/root-agent/jobs/:id/state", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  const parsed = buildStateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const terminal = ["succeeded", "failed", "canceled"].includes(parsed.data.status);
  const now = new Date();
  const [updated] = await db
    .update(routingGraphBuilds)
    .set({
      status: parsed.data.status,
      progress: parsed.data.progress ?? (parsed.data.status === "succeeded" ? 100 : build.progress),
      output: parsed.data.output ?? build.output,
      errorCode: parsed.data.errorCode ?? null,
      errorMessage: parsed.data.errorMessage ?? null,
      startedAt: build.startedAt ?? now,
      completedAt: terminal ? now : build.completedAt,
      updatedAt: now,
    })
    .where(eq(routingGraphBuilds.id, build.id))
    .returning();
  if (parsed.data.message) {
    await appendLog(build.id, terminal && parsed.data.status !== "succeeded" ? "error" : "info", parsed.data.message, null);
  }
  return c.json({ data: updated });
});

rootAgentRoute.post("/root-agent/activations/:id/state", async (c) => {
  const build = await findActivationForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph activation not found");
  const parsed = activationStateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const now = new Date();
  const [updated] = await db
    .update(routingGraphBuilds)
    .set({
      activationStatus: parsed.data.activationStatus,
      output: parsed.data.output ?? build.output,
      errorMessage: parsed.data.errorMessage ?? build.errorMessage,
      activatedAt: parsed.data.activationStatus === "active" ? now : build.activatedAt,
      updatedAt: now,
    })
    .where(eq(routingGraphBuilds.id, build.id))
    .returning();
  if (parsed.data.message) {
    await appendLog(
      build.id,
      parsed.data.activationStatus === "active" ? "info" : "error",
      parsed.data.message,
      null,
    );
  }
  return c.json({ data: updated });
});

rootAgentRoute.post("/root-agent/jobs/:id/logs", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  const parsed = logSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  await db.insert(routingGraphBuildLogs).values(
    parsed.data.entries.map((entry) => ({
      buildId: build.id,
      level: entry.level,
      message: entry.message,
      metadata: entry.metadata,
    })),
  );
  return c.json({ data: { inserted: parsed.data.entries.length } });
});

rootAgentRoute.post("/root-agent/jobs/:id/artifacts/upload-session", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  const parsed = artifactUploadSessionSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const fileName = safeFileName(parsed.data.fileName);
  const storageKey = `accounts/${build.accountId}/routing-graphs/${build.id}/${Date.now()}-${fileName}`;
  if (
    !storage.createMultipartUploadSession ||
    storageInfo.provider === "local"
  ) {
    return c.json({
      data: {
        strategy: "legacy_proxy",
        reason: "Storage provider does not support signed multipart uploads.",
        uploadUrl: `/root-agent/jobs/${build.id}/artifacts`,
      },
    });
  }

  const session = await storage.createMultipartUploadSession(
    storageKey,
    parsed.data.contentType,
    parsed.data.size,
  );
  await appendLog(build.id, "info", "Created direct artifact upload session", {
    fileName,
    kind: parsed.data.kind,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey,
    size: parsed.data.size,
    partCount: session.parts.length,
    partSize: session.partSize,
  });

  return c.json({
    data: {
      strategy: "multipart",
      storage: {
        provider: session.provider,
        bucket: session.bucket,
        key: session.key,
      },
      multipart: {
        uploadId: session.uploadId,
        partSize: session.partSize,
        expiresAt: session.expiresAt,
        parts: session.parts,
      },
    },
  });
});

rootAgentRoute.post("/root-agent/jobs/:id/artifacts/finalize", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  const parsed = artifactFinalizeSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const storage = getStorage();
  const storageInfo = storage.getInfo();
  if (
    parsed.data.storage.provider !== storageInfo.provider ||
    parsed.data.storage.bucket !== storageInfo.bucket
  ) {
    return c.json(
      {
        error: {
          code: "ARTIFACT_STORAGE_UNAVAILABLE",
          message: "Artifact was uploaded to a storage provider that is not active.",
        },
      },
      409,
    );
  }
  if (!storage.completeMultipartUpload) {
    return c.json(
      {
        error: {
          code: "ARTIFACT_DIRECT_UPLOAD_UNSUPPORTED",
          message: "Active storage provider cannot finalize multipart uploads.",
        },
      },
      409,
    );
  }

  const existing = await findExistingArtifact(build.id, parsed.data.storage.key);
  if (existing) {
    return c.json({ data: existing });
  }

  let objectMetadata = await storage.getMetadata(parsed.data.storage.key);
  if (!objectMetadata) {
    await storage.completeMultipartUpload(
      parsed.data.storage.key,
      parsed.data.storage.uploadId,
      parsed.data.storage.parts,
    );
    objectMetadata = await storage.getMetadata(parsed.data.storage.key);
  }
  if (!objectMetadata) {
    return c.json(
      {
        error: {
          code: "ARTIFACT_STORAGE_MISSING",
          message: "Uploaded artifact was not found in object storage.",
        },
      },
      409,
    );
  }
  if (objectMetadata.size !== parsed.data.size) {
    return c.json(
      {
        error: {
          code: "ARTIFACT_SIZE_MISMATCH",
          message: "Uploaded artifact size does not match the build metadata.",
        },
      },
      409,
    );
  }

  const artifact = await recordRoutingGraphArtifact({
    accountId: build.accountId,
    buildId: build.id,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey: parsed.data.storage.key,
    fileName: safeFileName(parsed.data.fileName),
    contentType: parsed.data.contentType,
    size: parsed.data.size,
    checksumSha256: parsed.data.checksumSha256 ?? null,
    artifactKind: parsed.data.kind,
    manifest: parsed.data.manifest,
    metadata: {
      ...parsed.data.manifest,
      directUpload: true,
      uploadId: parsed.data.storage.uploadId,
      partCount: parsed.data.storage.parts.length,
    },
  });
  await appendLog(build.id, "info", "Artifact direct upload finalized", {
    artifactId: artifact.id,
    fileName: artifact.fileName,
    size: artifact.size,
  });
  return c.json({ data: artifact }, 201);
});

rootAgentRoute.post("/root-agent/jobs/:id/artifacts", async (c) => {
  const build = await findBuildForAgent(c, c.req.param("id"));
  if (!build) return notFound(c, "Routing graph build not found");
  const body = c.req.raw.body;
  if (!body) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Artifact upload body is required" } },
      400,
    );
  }

  const fileName = safeFileName(c.req.header("x-artifact-filename") ?? `${build.id}.tar.gz`);
  const artifactKind = c.req.header("x-artifact-kind") ?? "valhalla_graph";
  const checksumSha256 = c.req.header("x-artifact-sha256") ?? null;
  const manifest = parseHeaderJson(c.req.header("x-artifact-manifest"));
  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const storageKey = `accounts/${build.accountId}/routing-graphs/${build.id}/${Date.now()}-${fileName}`;
  const artifactSize = numberHeader(c.req.header("x-artifact-size"));
  const uploaded = await storage.upload(
    storageKey,
    Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream),
    c.req.header("content-type") ?? "application/gzip",
    artifactSize,
  );
  const artifact = await recordRoutingGraphArtifact({
    accountId: build.accountId,
    buildId: build.id,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey: uploaded.key,
    fileName,
    contentType: uploaded.contentType,
    size: artifactSize ?? uploaded.size,
    checksumSha256,
    artifactKind,
    manifest,
    metadata: manifest,
  });
  await appendLog(build.id, "info", "Artifact uploaded", {
    artifactId: artifact?.id,
    fileName,
    size: artifactSize ?? uploaded.size,
  });
  return c.json({ data: artifact }, 201);
});

rootAgentRoute.get("/root-agent/artifacts/:id/download", async (c) => {
  const artifactId = c.req.param("id");
  const [artifact] = await db
    .select()
    .from(routingGraphArtifacts)
    .where(eq(routingGraphArtifacts.id, artifactId))
    .limit(1);
  if (!artifact?.storageObjectId) return notFound(c, "Routing graph artifact not found");
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, artifact.buildId),
        eq(routingGraphBuilds.accountId, c.get("accountId")),
        isNull(routingGraphBuilds.deletedAt),
      ),
    )
    .limit(1);
  if (
    !build ||
    (build.workerNodeId !== c.get("workerNodeId") &&
      build.activationWorkerNodeId !== c.get("workerNodeId"))
  ) {
    return notFound(c, "Routing graph artifact not found");
  }
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, artifact.storageObjectId))
    .limit(1);
  if (!object) return notFound(c, "Routing graph storage object not found");
  const storage = getStorage();
  const stream = storage.downloadStream
    ? await storage.downloadStream(object.storageKey)
    : Readable.from([await storage.download(object.storageKey)]);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "content-type": object.contentType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${artifact.fileName}"`,
    },
  });
});

async function authenticateAgent(c: Context<AgentEnv>) {
  const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return {
      ok: false as const,
      response: c.json(
        { error: { code: "UNAUTHORIZED", message: "Root agent token required" } },
        401,
      ),
    };
  }
  const [row] = await db
    .select()
    .from(rootAgentNodeTokens)
    .where(and(eq(rootAgentNodeTokens.tokenHash, hashToken(token)), isNull(rootAgentNodeTokens.revokedAt)))
    .limit(1);
  if (!row) {
    return {
      ok: false as const,
      response: c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid root agent token" } },
        401,
      ),
    };
  }
  await Promise.all([
    db
      .update(rootAgentNodeTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(rootAgentNodeTokens.id, row.id)),
    db
      .update(workerNodes)
      .set({ status: "healthy", lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(workerNodes.id, row.workerNodeId)),
  ]);
  return { ok: true as const, accountId: row.accountId, workerNodeId: row.workerNodeId };
}

async function findBuildForAgent(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
        eq(routingGraphBuilds.accountId, c.get("accountId")),
        eq(routingGraphBuilds.workerNodeId, c.get("workerNodeId")),
        isNull(routingGraphBuilds.deletedAt),
      ),
    )
    .limit(1);
  return build ?? null;
}

async function findActivationForAgent(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
        eq(routingGraphBuilds.accountId, c.get("accountId")),
        eq(routingGraphBuilds.activationWorkerNodeId, c.get("workerNodeId")),
        inArray(routingGraphBuilds.activationStatus, ["activation_requested", "activating"]),
        isNull(routingGraphBuilds.deletedAt),
      ),
    )
    .limit(1);
  return build ?? null;
}

async function appendLog(
  buildId: string,
  level: string,
  message: string,
  metadata: unknown,
) {
  await db.insert(routingGraphBuildLogs).values({ buildId, level, message, metadata });
}

async function findExistingArtifact(buildId: string, storageKey: string) {
  const rows = await db
    .select({ artifact: routingGraphArtifacts, object: storageObjects })
    .from(routingGraphArtifacts)
    .innerJoin(
      storageObjects,
      eq(routingGraphArtifacts.storageObjectId, storageObjects.id),
    )
    .where(
      and(
        eq(routingGraphArtifacts.buildId, buildId),
        eq(storageObjects.storageKey, storageKey),
      ),
    )
    .limit(1);
  return rows[0]?.artifact ?? null;
}

async function recordRoutingGraphArtifact(params: {
  accountId: string;
  buildId: string;
  provider: "local" | "s3" | "r2";
  bucket: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  size: number;
  checksumSha256: string | null;
  artifactKind: string;
  manifest: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const [existingObject] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.provider, params.provider),
        eq(storageObjects.bucket, params.bucket),
        eq(storageObjects.storageKey, params.storageKey),
        isNull(storageObjects.deletedAt),
      ),
    )
    .limit(1);
  const [createdObject] = existingObject
    ? [existingObject]
    : await db
        .insert(storageObjects)
        .values({
          accountId: params.accountId,
          provider: params.provider,
          bucket: params.bucket,
          storageKey: params.storageKey,
          fileName: params.fileName,
          contentType: params.contentType,
          size: params.size,
          contentHash: params.checksumSha256,
          resourceType: "routing_graph_build",
          resourceId: params.buildId,
          artifactKind: params.artifactKind,
          metadata: params.metadata,
        })
        .returning();
  const [artifact] = await db
    .insert(routingGraphArtifacts)
    .values({
      accountId: params.accountId,
      buildId: params.buildId,
      storageObjectId: createdObject?.id,
      kind: params.artifactKind,
      status: "available",
      fileName: params.fileName,
      size: params.size,
      checksumSha256: params.checksumSha256,
      manifest: params.manifest,
    })
    .returning();
  if (!artifact) throw new Error("Failed to record routing graph artifact");
  return artifact;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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

function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "artifact.tar.gz";
}

function parseHeaderJson(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function numberHeader(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readJsonObject(c: Context) {
  if (!c.req.header("content-type")?.includes("application/json")) return {};
  try {
    return asRecord(await c.req.json());
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
