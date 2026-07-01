import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { Hono, type Context } from "hono";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  basemapArtifacts,
  basemapBuildLogs,
  basemapBuilds,
  basemapReleases,
  rootAgentNodeTokens,
  rootAgentRegistrationTokens,
  runtimeInstallations,
  routingGraphArtifacts,
  routingGraphBuildLogs,
  routingGraphBuilds,
  routingGraphReleases,
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

  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.accountId, accountId),
        eq(basemapBuilds.workerNodeId, workerNodeId),
        eq(basemapBuilds.status, "queued"),
        isNull(basemapBuilds.deletedAt),
      ),
    )
    .orderBy(basemapBuilds.createdAt)
    .limit(1);
  if (basemapBuild) {
    const [claimed] = await db
      .update(basemapBuilds)
      .set({ status: "assigned", assignedAt: now, updatedAt: now })
      .where(eq(basemapBuilds.id, basemapBuild.id))
      .returning();
    await appendLog(basemapBuild.id, "info", "Basemap build claimed by root agent", {
      workerNodeId,
    });
    return c.json({ data: { kind: "basemap_build", build: claimed } });
  }

  const [basemapActivation] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.accountId, accountId),
        eq(basemapBuilds.activationWorkerNodeId, workerNodeId),
        eq(basemapBuilds.status, "succeeded"),
        eq(basemapBuilds.activationStatus, "activation_requested"),
        isNull(basemapBuilds.deletedAt),
      ),
    )
    .orderBy(basemapBuilds.updatedAt)
    .limit(1);
  if (basemapActivation) {
    const [claimed] = await db
      .update(basemapBuilds)
      .set({ activationStatus: "activating", updatedAt: now })
      .where(eq(basemapBuilds.id, basemapActivation.id))
      .returning();
    const artifacts = await db
      .select()
      .from(basemapArtifacts)
      .where(eq(basemapArtifacts.buildId, basemapActivation.id));
    await appendLog(basemapActivation.id, "info", "Basemap activation claimed by root agent", {
      workerNodeId,
    });
    return c.json({
      data: { kind: "basemap_activation", build: claimed, artifacts },
    });
  }

  return c.json({ data: null });
});

rootAgentRoute.get("/root-agent/jobs/:id/cancel", async (c) => {
  const job = await findBuildForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Build not found");
  return c.json({ data: { cancelRequested: Boolean(job.build.cancelRequestedAt) } });
});

rootAgentRoute.post("/root-agent/jobs/:id/state", async (c) => {
  const job = await findBuildForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Build not found");
  const parsed = buildStateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const terminal = ["succeeded", "failed", "canceled"].includes(parsed.data.status);
  const now = new Date();
  const baseUpdate = {
    progress: parsed.data.progress ?? (parsed.data.status === "succeeded" ? 100 : job.build.progress),
    output: parsed.data.output ?? job.build.output,
    errorCode: parsed.data.errorCode ?? null,
    errorMessage: parsed.data.errorMessage ?? null,
    startedAt: job.build.startedAt ?? now,
    completedAt: terminal ? now : job.build.completedAt,
    updatedAt: now,
  };
  const [updated] =
    job.kind === "routing"
      ? await db
          .update(routingGraphBuilds)
          .set({ ...baseUpdate, status: parsed.data.status })
          .where(eq(routingGraphBuilds.id, job.build.id))
          .returning()
      : await db
          .update(basemapBuilds)
          .set({
            ...baseUpdate,
            status:
              parsed.data.status === "building_admins"
                ? "building_tiles"
                : parsed.data.status,
          })
          .where(eq(basemapBuilds.id, job.build.id))
          .returning();
  if (parsed.data.message) {
    await appendLog(job.build.id, terminal && parsed.data.status !== "succeeded" ? "error" : "info", parsed.data.message, null);
  }
  return c.json({ data: updated });
});

rootAgentRoute.post("/root-agent/activations/:id/state", async (c) => {
  const job = await findActivationForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Activation not found");
  const parsed = activationStateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const now = new Date();
  const update = {
    activationStatus: parsed.data.activationStatus,
    output: parsed.data.output ?? job.build.output,
    errorMessage: parsed.data.errorMessage ?? job.build.errorMessage,
    activatedAt: parsed.data.activationStatus === "active" ? now : job.build.activatedAt,
    updatedAt: now,
  };
  const [updated] =
    job.kind === "routing"
      ? await db
          .update(routingGraphBuilds)
          .set(update)
          .where(eq(routingGraphBuilds.id, job.build.id))
          .returning()
      : await db
          .update(basemapBuilds)
          .set(update)
          .where(eq(basemapBuilds.id, job.build.id))
          .returning();
  if (parsed.data.activationStatus === "active") {
    if (job.kind === "routing") {
      await db
        .update(routingGraphReleases)
        .set({ activationStatus: "active", activatedAt: now, updatedAt: now })
        .where(eq(routingGraphReleases.buildId, job.build.id));
    } else {
      const output = asRecord(parsed.data.output);
      await db
        .update(basemapReleases)
        .set({
          activationStatus: "active",
          activatedAt: now,
          updatedAt: now,
          martinSource:
            typeof output.martinSource === "string" ? output.martinSource : undefined,
          martinSourceVersioned:
            typeof output.martinSourceVersioned === "string"
              ? output.martinSourceVersioned
              : undefined,
          activationMetadata: output,
        })
        .where(eq(basemapReleases.buildId, job.build.id));
    }
  }
  await recordRuntimeInstallation({
    accountId: c.get("accountId"),
    workerNodeId: c.get("workerNodeId"),
    job,
    activationStatus: parsed.data.activationStatus,
    output: parsed.data.output,
    errorMessage: parsed.data.errorMessage,
    now,
  });
  if (parsed.data.message) {
    await appendLog(
      job.build.id,
      parsed.data.activationStatus === "active" ? "info" : "error",
      parsed.data.message,
      null,
    );
  }
  return c.json({ data: updated });
});

rootAgentRoute.post("/root-agent/jobs/:id/logs", async (c) => {
  const job =
    (await findBuildForAgent(c, c.req.param("id"))) ??
    (await findActivationForAgent(c, c.req.param("id")));
  if (!job) return notFound(c, "Build not found");
  const parsed = logSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const rows = parsed.data.entries.map((entry) => ({
    buildId: job.build.id,
    level: entry.level,
    message: entry.message,
    metadata: entry.metadata,
  }));
  if (job.kind === "routing") await db.insert(routingGraphBuildLogs).values(rows);
  else await db.insert(basemapBuildLogs).values(rows);
  return c.json({ data: { inserted: parsed.data.entries.length } });
});

rootAgentRoute.post("/root-agent/jobs/:id/artifacts/upload-session", async (c) => {
  const job = await findBuildForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Build not found");
  const parsed = artifactUploadSessionSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const fileName = safeFileName(parsed.data.fileName);
  const storageKey = artifactStorageKey(job, fileName);
  if (
    !storage.createMultipartUploadSession ||
    storageInfo.provider === "local"
  ) {
    return c.json({
      data: {
        strategy: "legacy_proxy",
        reason: "Storage provider does not support signed multipart uploads.",
        uploadUrl: `/root-agent/jobs/${job.build.id}/artifacts`,
      },
    });
  }

  const session = await storage.createMultipartUploadSession(
    storageKey,
    parsed.data.contentType,
    parsed.data.size,
  );
  await appendLog(job.build.id, "info", "Created direct artifact upload session", {
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
  const job = await findBuildForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Build not found");
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

  const existing = await findExistingArtifact(job, parsed.data.storage.key);
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

  const artifact = await recordBuildArtifact(job, {
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
  await appendLog(job.build.id, "info", "Artifact direct upload finalized", {
    artifactId: artifact.id,
    fileName: artifact.fileName,
    size: artifact.size,
  });
  return c.json({ data: artifact }, 201);
});

rootAgentRoute.post("/root-agent/jobs/:id/artifacts", async (c) => {
  const job = await findBuildForAgent(c, c.req.param("id"));
  if (!job) return notFound(c, "Build not found");
  const body = c.req.raw.body;
  if (!body) {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Artifact upload body is required" } },
      400,
    );
  }

  const fileName = safeFileName(c.req.header("x-artifact-filename") ?? `${job.build.id}.tar.gz`);
  const artifactKind =
    c.req.header("x-artifact-kind") ??
    (job.kind === "routing" ? "valhalla_graph" : "basemap_tiles");
  const checksumSha256 = c.req.header("x-artifact-sha256") ?? null;
  const manifest = parseHeaderJson(c.req.header("x-artifact-manifest"));
  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const storageKey = artifactStorageKey(job, fileName);
  const artifactSize = numberHeader(c.req.header("x-artifact-size"));
  const uploaded = await storage.upload(
    storageKey,
    Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream),
    c.req.header("content-type") ?? "application/gzip",
    artifactSize,
  );
  const artifact = await recordBuildArtifact(job, {
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
  await appendLog(job.build.id, "info", "Artifact uploaded", {
    artifactId: artifact?.id,
    fileName,
    size: artifactSize ?? uploaded.size,
  });
  return c.json({ data: artifact }, 201);
});

rootAgentRoute.get("/root-agent/artifacts/:id/download", async (c) => {
  const artifactId = c.req.param("id");
  const [routingArtifact] = await db
    .select()
    .from(routingGraphArtifacts)
    .where(eq(routingGraphArtifacts.id, artifactId))
    .limit(1);
  const artifact = routingArtifact
    ? { kind: "routing" as const, artifact: routingArtifact }
    : await findBasemapArtifactForDownload(artifactId);
  if (!artifact?.artifact.storageObjectId) return notFound(c, "Artifact not found");
  const build =
    artifact.kind === "routing"
      ? await findRoutingBuildForArtifact(c, artifact.artifact.buildId)
      : await findBasemapBuildForArtifact(c, artifact.artifact.buildId);
  if (!build) return notFound(c, "Artifact not found");
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, artifact.artifact.storageObjectId))
    .limit(1);
  if (!object) return notFound(c, "Storage object not found");
  const storage = getStorage();
  const totalSize = object.size ?? artifact.artifact.size ?? null;
  const range = parseByteRange(c.req.header("range"), totalSize);
  if (range.status === "invalid") {
    return new Response(null, {
      status: 416,
      headers: totalSize === null ? undefined : { "content-range": `bytes */${totalSize}` },
    });
  }
  if (range.status === "partial") {
    const length = range.end - range.start + 1;
    const chunk = await storage.readRange(object.storageKey, range.start, length);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "accept-ranges": "bytes",
        "content-type": object.contentType ?? "application/octet-stream",
        "content-length": String(chunk.length),
        "content-range": `bytes ${range.start}-${range.start + chunk.length - 1}/${totalSize}`,
        "content-disposition": `attachment; filename="${artifact.artifact.fileName}"`,
      },
    });
  }
  const stream = storage.downloadStream
    ? await storage.downloadStream(object.storageKey)
    : Readable.from([await storage.download(object.storageKey)]);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "accept-ranges": totalSize === null ? "none" : "bytes",
      "content-type": object.contentType ?? "application/octet-stream",
      ...(totalSize === null ? {} : { "content-length": String(totalSize) }),
      "content-disposition": `attachment; filename="${artifact.artifact.fileName}"`,
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
  const [node] = await db
    .select({ id: workerNodes.id })
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, row.workerNodeId),
        eq(workerNodes.accountId, row.accountId),
        isNull(workerNodes.deletedAt),
      ),
    )
    .limit(1);
  if (!node) {
    await db
      .update(rootAgentNodeTokens)
      .set({ revokedAt: new Date() })
      .where(eq(rootAgentNodeTokens.id, row.id));
    return {
      ok: false as const,
      response: c.json(
        { error: { code: "UNAUTHORIZED", message: "Root agent node is no longer active" } },
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
  const [routingBuild] = await db
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
  if (routingBuild) return { kind: "routing" as const, build: routingBuild };
  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get("accountId")),
        eq(basemapBuilds.workerNodeId, c.get("workerNodeId")),
        isNull(basemapBuilds.deletedAt),
      ),
    )
    .limit(1);
  return basemapBuild ? { kind: "basemap" as const, build: basemapBuild } : null;
}

async function findActivationForAgent(c: Context<AgentEnv>, buildId: string) {
  const [routingBuild] = await db
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
  if (routingBuild) return { kind: "routing" as const, build: routingBuild };
  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get("accountId")),
        eq(basemapBuilds.activationWorkerNodeId, c.get("workerNodeId")),
        inArray(basemapBuilds.activationStatus, ["activation_requested", "activating"]),
        isNull(basemapBuilds.deletedAt),
      ),
    )
    .limit(1);
  return basemapBuild ? { kind: "basemap" as const, build: basemapBuild } : null;
}

function parseByteRange(
  header: string | undefined,
  totalSize: number | null,
):
  | { status: "none" }
  | { status: "partial"; start: number; end: number }
  | { status: "invalid" } {
  if (!header) return { status: "none" };
  if (totalSize === null || totalSize < 0) return { status: "invalid" };
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return { status: "invalid" };
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalSize - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) {
    return { status: "invalid" };
  }
  if (start < 0 || requestedEnd < start || start >= totalSize) {
    return { status: "invalid" };
  }
  return { status: "partial", start, end: Math.min(requestedEnd, totalSize - 1) };
}

async function recordRuntimeInstallation(params: {
  accountId: string;
  workerNodeId: string;
  job: NonNullable<Awaited<ReturnType<typeof findActivationForAgent>>>;
  activationStatus: "active" | "failed";
  output: Record<string, unknown> | undefined;
  errorMessage: string | undefined;
  now: Date;
}) {
  const output = asRecord(params.output);
  const [artifact] =
    params.job.kind === "routing"
      ? await db
          .select({ id: routingGraphArtifacts.id })
          .from(routingGraphArtifacts)
          .where(
            and(
              eq(routingGraphArtifacts.buildId, params.job.build.id),
              eq(routingGraphArtifacts.status, "available"),
            ),
          )
          .limit(1)
      : await db
          .select({ id: basemapArtifacts.id })
          .from(basemapArtifacts)
          .where(
            and(
              eq(basemapArtifacts.buildId, params.job.build.id),
              eq(basemapArtifacts.status, "available"),
            ),
          )
          .limit(1);
  const [release] =
    params.job.kind === "routing"
      ? await db
          .select({ id: routingGraphReleases.id })
          .from(routingGraphReleases)
          .where(eq(routingGraphReleases.buildId, params.job.build.id))
          .limit(1)
      : await db
          .select({ id: basemapReleases.id })
          .from(basemapReleases)
          .where(eq(basemapReleases.buildId, params.job.build.id))
          .limit(1);
  const runtimePath =
    stringFromRecord(output, "valhallaDataDir") ??
    stringFromRecord(output, "martinPath") ??
    stringFromRecord(output, "martinSourcesDir");
  const versionedPath =
    stringFromRecord(output, "valhallaReleaseDir") ??
    stringFromRecord(output, "martinPathVersioned");

  await db.insert(runtimeInstallations).values({
    accountId: params.accountId,
    workerNodeId: params.workerNodeId,
    resourceType: params.job.kind === "routing" ? "routing_graph" : "basemap",
    buildId: params.job.build.id,
    artifactId: artifact?.id ?? null,
    releaseId: release?.id ?? null,
    status: params.activationStatus === "active" ? "active" : "failed",
    runtimePath,
    versionedPath,
    metadata: output,
    errorMessage: params.errorMessage ?? null,
    installedAt: params.activationStatus === "active" ? params.now : null,
    activatedAt: params.activationStatus === "active" ? params.now : null,
    updatedAt: params.now,
  });
}

async function appendLog(
  buildId: string,
  level: string,
  message: string,
  metadata: unknown,
) {
  const [routingBuild] = await db
    .select({ id: routingGraphBuilds.id })
    .from(routingGraphBuilds)
    .where(eq(routingGraphBuilds.id, buildId))
    .limit(1);
  if (routingBuild) {
    await db.insert(routingGraphBuildLogs).values({ buildId, level, message, metadata });
    return;
  }
  await db.insert(basemapBuildLogs).values({ buildId, level, message, metadata });
}

async function findExistingArtifact(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  storageKey: string,
) {
  if (job.kind === "routing") {
    const rows = await db
      .select({ artifact: routingGraphArtifacts, object: storageObjects })
      .from(routingGraphArtifacts)
      .innerJoin(
        storageObjects,
        eq(routingGraphArtifacts.storageObjectId, storageObjects.id),
      )
      .where(
        and(
          eq(routingGraphArtifacts.buildId, job.build.id),
          eq(storageObjects.storageKey, storageKey),
        ),
      )
      .limit(1);
    return rows[0]?.artifact ?? null;
  }
  const rows = await db
    .select({ artifact: basemapArtifacts, object: storageObjects })
    .from(basemapArtifacts)
    .innerJoin(storageObjects, eq(basemapArtifacts.storageObjectId, storageObjects.id))
    .where(and(eq(basemapArtifacts.buildId, job.build.id), eq(storageObjects.storageKey, storageKey)))
    .limit(1);
  return rows[0]?.artifact ?? null;
}

async function recordBuildArtifact(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  params: {
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
          accountId: job.build.accountId,
          provider: params.provider,
          bucket: params.bucket,
          storageKey: params.storageKey,
          fileName: params.fileName,
          contentType: params.contentType,
          size: params.size,
          contentHash: params.checksumSha256,
          resourceType: job.kind === "routing" ? "routing_graph_build" : "basemap_build",
          resourceId: job.build.id,
          artifactKind: params.artifactKind,
          metadata: params.metadata,
        })
        .returning();
  if (job.kind === "routing") {
    const [artifact] = await db
      .insert(routingGraphArtifacts)
      .values({
        accountId: job.build.accountId,
        buildId: job.build.id,
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
    if (params.artifactKind === "valhalla_graph") {
      await ensureRoutingGraphRelease(job.build, artifact.id, params.manifest);
    }
    return artifact;
  }
  const [artifact] = await db
    .insert(basemapArtifacts)
    .values({
      accountId: job.build.accountId,
      buildId: job.build.id,
      storageObjectId: createdObject?.id,
      kind: params.artifactKind,
      status: "available",
      fileName: params.fileName,
      size: params.size,
      checksumSha256: params.checksumSha256,
      manifest: params.manifest,
    })
    .returning();
  if (!artifact) throw new Error("Failed to record basemap artifact");
  if (params.artifactKind === "basemap_tiles") {
    await ensureBasemapRelease(job.build, artifact.id, createdObject?.id ?? null, params.manifest);
  }
  return artifact;
}

function artifactStorageKey(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  fileName: string,
) {
  const domain = job.kind === "routing" ? "routing-graphs" : "basemaps";
  return `accounts/${job.build.accountId}/${domain}/${job.build.id}/${Date.now()}-${fileName}`;
}

async function ensureRoutingGraphRelease(
  build: typeof routingGraphBuilds.$inferSelect,
  artifactId: string,
  manifest: Record<string, unknown>,
) {
  const [existing] = await db
    .select()
    .from(routingGraphReleases)
    .where(and(eq(routingGraphReleases.buildId, build.id), eq(routingGraphReleases.artifactId, artifactId)))
    .limit(1);
  if (existing) return existing;
  const now = new Date();
  const [release] = await db
    .insert(routingGraphReleases)
    .values({
      accountId: build.accountId,
      buildId: build.id,
      artifactId,
      name: build.name,
      version: build.id.slice(0, 8),
      status: "published",
      activationStatus: build.activationStatus,
      sourceDataVersions: {
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        valhallaImage: build.valhallaImage,
      },
      manifest,
      publishedAt: now,
    })
    .returning();
  return release;
}

async function ensureBasemapRelease(
  build: typeof basemapBuilds.$inferSelect,
  artifactId: string,
  storageObjectId: string | null,
  manifest: Record<string, unknown>,
) {
  const [existing] = await db
    .select()
    .from(basemapReleases)
    .where(and(eq(basemapReleases.buildId, build.id), eq(basemapReleases.artifactId, artifactId)))
    .limit(1);
  if (existing) return existing;
  const now = new Date();
  const [release] = await db
    .insert(basemapReleases)
    .values({
      accountId: build.accountId,
      buildId: build.id,
      artifactId,
      artifactStorageObjectId: storageObjectId,
      name: build.name,
      version: build.id.slice(0, 8),
      status: "published",
      activationStatus: build.activationStatus,
      sourceDataVersions: {
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        engine: build.engine,
        sourceKind: build.sourceKind,
      },
      schemaVersion: build.profile,
      bounds: build.areaOfInterest,
      minZoom: readNumber(manifest.minZoom, 0),
      maxZoom: readNumber(manifest.maxZoom, 14),
      attribution: typeof manifest.attribution === "string" ? manifest.attribution : null,
      tilejson: asRecord(manifest.tilejson),
      styleCompatibility: { profile: build.profile, outputFormat: build.outputFormat },
      publishedAt: now,
    })
    .returning();
  return release;
}

async function findBasemapArtifactForDownload(artifactId: string) {
  const [artifact] = await db
    .select()
    .from(basemapArtifacts)
    .where(eq(basemapArtifacts.id, artifactId))
    .limit(1);
  return artifact ? { kind: "basemap" as const, artifact } : null;
}

async function findRoutingBuildForArtifact(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
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
    return null;
  }
  return build;
}

async function findBasemapBuildForArtifact(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get("accountId")),
        isNull(basemapBuilds.deletedAt),
      ),
    )
    .limit(1);
  if (
    !build ||
    (build.workerNodeId !== c.get("workerNodeId") &&
      build.activationWorkerNodeId !== c.get("workerNodeId"))
  ) {
    return null;
  }
  return build;
}

function readNumber(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
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

function stringFromRecord(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" && field ? field : null;
}
