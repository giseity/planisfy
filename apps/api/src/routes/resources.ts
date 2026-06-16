import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  accounts,
  processingJobLogs,
  processingJobs,
  storageObjects,
  tilesetVersions,
  tilesets,
  uploads,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import { StoragePaths } from "@planisfy/storage-paths";
import type { AuthEnv } from "../middleware/auth";
import {
  ActiveProcessingJobLimitError,
  createProcessingJob,
  logProcessingJob,
} from "../lib/processing-jobs";
import { recordStorageObject } from "../lib/storage-ledger";
import { logAudit } from "../lib/audit";
import { registerPublishedTileAliases } from "../lib/martin-sources";
import {
  buildTilesetPublishAuditMetadata,
  classifyVersionPublish,
} from "../lib/publish-safety";
import { enqueueOutboxEvent } from "../lib/outbox";
import { checkResourceLimit } from "../lib/plan-check";
import { verifyStorageArtifactAvailable } from "../lib/storage-artifact-availability";
import {
  buildRetrySourceResource,
  parseSourceProcessingJobInput,
  type SourceProcessingJobInput,
} from "@planisfy/geodata-contracts";
import {
  detectUploadFormat,
  toStorageFileName,
  unsupportedUploadFormatMessage,
} from "../lib/upload-policy";
import { isRequestBodyTooLarge } from "../lib/request-size";
import {
  ExecutionRuntimeSelectionError,
  resolveExecutionRuntimeSelection,
} from "../lib/execution-runtime";
import { requireOrgMutationPermission } from "../middleware/auth";

export const resourcesRoute = new Hono<AuthEnv>();

resourcesRoute.use("/uploads", requireOrgMutationPermission("resource.write"));
resourcesRoute.use(
  "/uploads/*",
  requireOrgMutationPermission("resource.write"),
);
resourcesRoute.use(
  "/tilesets/*",
  requireOrgMutationPermission("resource.write"),
);
resourcesRoute.use("/jobs/*", requireOrgMutationPermission("resource.write"));

const MAX_UPLOAD_SIZE = 250 * 1024 * 1024;
const MAX_MULTIPART_UPLOAD_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024;

const createTilesetSchema = z.object({
  name: z.string().min(1).max(128),
  handle: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().max(1000).optional(),
  minZoom: z.number().int().min(0).max(24).optional(),
  maxZoom: z.number().int().min(0).max(24).optional(),
  csvLatitude: z.string().max(128).optional(),
  csvLongitude: z.string().max(128).optional(),
  executionTargetId: z.string().uuid().optional(),
  workerProfileId: z.string().uuid().optional(),
});

resourcesRoute.get("/uploads", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.accountId, accountId), isNull(uploads.deletedAt)))
    .orderBy(desc(uploads.createdAt));

  return c.json({ data: rows });
});

resourcesRoute.post("/uploads", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  if (isRequestBodyTooLarge(c.req.raw.headers, MAX_MULTIPART_UPLOAD_SIZE)) {
    return c.json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `Upload request too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB file)`,
        },
      },
      413,
    );
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const optionsRaw = formData.get("options");
  const parsedOptions =
    typeof optionsRaw === "string" && optionsRaw
      ? (JSON.parse(optionsRaw) as unknown)
      : {};
  const parsed = createTilesetSchema.safeParse(parsedOptions);

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tileset options",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  if (!file) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "No file provided" } },
      400,
    );
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB)`,
        },
      },
      400,
    );
  }

  const format = detectUploadFormat(file.name, file.type);
  if (!format) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: unsupportedUploadFormatMessage(),
        },
      },
      400,
    );
  }

  const [existing] = await db
    .select({ id: tilesets.id })
    .from(tilesets)
    .where(
      and(
        eq(tilesets.accountId, accountId),
        eq(tilesets.handle, parsed.data.handle),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(
      { error: { code: "CONFLICT", message: "Tileset handle already exists" } },
      409,
    );
  }

  const planCheck = await checkResourceLimit(userId, accountId, "tilesets");
  if (!planCheck.allowed) {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${planCheck.limit} tilesets on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }

  let runtimeSelection: Awaited<
    ReturnType<typeof resolveExecutionRuntimeSelection>
  >;
  try {
    runtimeSelection = await resolveExecutionRuntimeSelection(accountId, {
      executionTargetId: parsed.data.executionTargetId,
      workerProfileId: parsed.data.workerProfileId,
    });
  } catch (err) {
    if (err instanceof ExecutionRuntimeSelectionError) {
      return c.json({ error: { code: err.code, message: err.message } }, 404);
    }
    throw err;
  }

  const [upload] = await db
    .insert(uploads)
    .values({
      accountId,
      originalFileName: file.name || "upload",
      contentType: file.type || null,
      size: file.size,
      status: "PENDING",
    })
    .returning();

  if (!upload) {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create upload" } },
      500,
    );
  }

  const storage = getStorage();
  const storageFileName = toStorageFileName(file.name || "upload");
  const uploadKey = StoragePaths.uploadOriginal(
    accountId,
    upload.id,
    storageFileName,
  );
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storage.upload(
    uploadKey,
    buffer,
    file.type || undefined,
  );
  const storageInfo = storage.getInfo();
  const storageObject = await recordStorageObject({
    accountId,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey: uploadKey,
    fileName: storageFileName,
    contentType: stored.contentType,
    size: stored.size,
    resourceType: "upload",
    resourceId: upload.id,
    artifactKind: "original",
    metadata: { originalFileName: file.name, format },
  });

  const [tileset] = await db
    .insert(tilesets)
    .values({
      accountId,
      name: parsed.data.name,
      handle: parsed.data.handle,
      description: parsed.data.description ?? null,
      status: "BUILDING",
      minZoom: parsed.data.minZoom ?? 0,
      maxZoom: parsed.data.maxZoom ?? 14,
    })
    .returning();

  if (!tileset) {
    return c.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Failed to create tileset" },
      },
      500,
    );
  }

  await db
    .update(uploads)
    .set({
      status: "UPLOADED",
      storageObjectId: storageObject.id,
      linkedTilesetId: tileset.id,
    })
    .where(eq(uploads.id, upload.id));

  let processingJob: typeof processingJobs.$inferSelect;
  try {
    processingJob = await createProcessingJob({
      accountId,
      type: "tileset.process_upload",
      executionTargetId: runtimeSelection.executionTargetId,
      workerProfileId: runtimeSelection.workerProfileId,
      input: {
        tilesetId: tileset.id,
        uploadId: upload.id,
        storageObjectId: storageObject.id,
        uploadKey,
        format,
        csv: {
          latitude: parsed.data.csvLatitude,
          longitude: parsed.data.csvLongitude,
        },
        options: {
          minZoom: parsed.data.minZoom ?? 0,
          maxZoom: parsed.data.maxZoom ?? 14,
        },
      },
    });
  } catch (err) {
    const response = processingJobLimitResponse(c, err);
    if (response) return response;
    throw err;
  }

  await db
    .update(tilesets)
    .set({ buildJobId: processingJob.id, updatedAt: new Date() })
    .where(eq(tilesets.id, tileset.id));

  await logProcessingJob(processingJob.id, "Upload received and queued", {
    metadata: {
      uploadId: upload.id,
      tilesetId: tileset.id,
      uploadKey,
      format,
      executionTargetId: runtimeSelection.executionTargetId,
      workerProfileId: runtimeSelection.workerProfileId,
    },
  });

  await enqueueOutboxEvent({
    eventName: "tileset.build.requested",
    payload: {
      accountId,
      tilesetId: tileset.id,
      jobId: processingJob.id,
      sourceResourceType: "upload",
      sourceResourceId: upload.id,
      options: {
        minZoom: parsed.data.minZoom ?? 0,
        maxZoom: parsed.data.maxZoom ?? 14,
      },
    },
  });

  logAudit({
    profileId: userId,
    action: "tileset.uploaded",
    resourceType: "tileset",
    resourceId: tileset.id,
    metadata: {
      uploadId: upload.id,
      processingJobId: processingJob.id,
      format,
    },
  });

  return c.json({ data: { upload, tileset, processingJob } }, 201);
});

resourcesRoute.get("/tilesets", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(tilesets)
    .where(and(eq(tilesets.accountId, accountId), isNull(tilesets.deletedAt)))
    .orderBy(desc(tilesets.updatedAt));

  const ownerHandle = await getOwnerHandle(accountId);
  const versions =
    rows.length > 0
      ? await db
          .select()
          .from(tilesetVersions)
          .where(
            inArray(
              tilesetVersions.tilesetId,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(desc(tilesetVersions.version))
      : [];
  const linkedUploads =
    rows.length > 0
      ? await db
          .select()
          .from(uploads)
          .where(
            and(
              eq(uploads.accountId, accountId),
              inArray(
                uploads.linkedTilesetId,
                rows.map((row) => row.id),
              ),
              isNull(uploads.deletedAt),
            ),
          )
          .orderBy(desc(uploads.createdAt))
      : [];
  const artifactById = await fetchArtifactMap(versions);
  const uploadAvailabilityById =
    await fetchUploadArtifactAvailabilityMap(linkedUploads);

  return c.json({
    data: rows.map((row) =>
      toConsoleTileset(row, ownerHandle, versionsForTileset(versions, row.id), {
        uploads: uploadsForTileset(linkedUploads, row.id),
        artifactById,
        uploadAvailabilityById,
      }),
    ),
  });
});

resourcesRoute.get("/tilesets/:id", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, id),
        eq(tilesets.accountId, accountId),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);

  if (!tileset)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );

  const versions = await db
    .select()
    .from(tilesetVersions)
    .where(eq(tilesetVersions.tilesetId, id))
    .orderBy(desc(tilesetVersions.version));

  const ownerHandle = await getOwnerHandle(accountId);
  const linkedUploads = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.accountId, accountId),
        eq(uploads.linkedTilesetId, id),
        isNull(uploads.deletedAt),
      ),
    )
    .orderBy(desc(uploads.createdAt));
  const artifactById = await fetchArtifactMap(versions);
  const uploadAvailabilityById =
    await fetchUploadArtifactAvailabilityMap(linkedUploads);

  return c.json({
    data: toConsoleTileset(tileset, ownerHandle, versions, {
      uploads: linkedUploads,
      artifactById,
      uploadAvailabilityById,
    }),
  });
});

resourcesRoute.post("/tilesets/:id/versions/:version/publish", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const version = Number(c.req.param("version"));

  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, id),
        eq(tilesets.accountId, accountId),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);
  if (!tileset)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );

  const [targetVersion] = await db
    .select()
    .from(tilesetVersions)
    .where(
      and(
        eq(tilesetVersions.tilesetId, id),
        eq(tilesetVersions.version, version),
      ),
    )
    .limit(1);
  if (!targetVersion)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
      404,
    );
  if (!targetVersion.artifactStorageObjectId)
    return c.json(
      {
        error: {
          code: "ARTIFACT_NOT_FOUND",
          message: "Tileset version has no processed artifact",
        },
      },
      400,
    );
  if (targetVersion.format !== "PMTILES" && targetVersion.format !== "MBTILES")
    return c.json(
      {
        error: {
          code: "UNSUPPORTED_TILESET_ARTIFACT",
          message:
            "Tileset version must be a PMTiles or MBTiles artifact before it can be published",
        },
      },
      400,
    );

  const ownerHandle = await getOwnerHandle(accountId);
  if (!ownerHandle)
    return c.json(
      {
        error: {
          code: "OWNER_HANDLE_NOT_FOUND",
          message: "Tileset owner account handle was not found",
        },
      },
      400,
    );

  const previousVersion = tileset.currentVersionId
    ? await db
        .select({ version: tilesetVersions.version })
        .from(tilesetVersions)
        .where(eq(tilesetVersions.id, tileset.currentVersionId))
        .limit(1)
        .then((rows) => rows[0]?.version ?? null)
    : null;
  const publishAction = classifyVersionPublish({
    currentVersionNumber: previousVersion,
    targetVersionNumber: targetVersion.version,
    isCurrentVersion: tileset.currentVersionId === targetVersion.id,
  });

  const [artifact] = await db
    .select({
      provider: storageObjects.provider,
      bucket: storageObjects.bucket,
      storageKey: storageObjects.storageKey,
    })
    .from(storageObjects)
    .where(eq(storageObjects.id, targetVersion.artifactStorageObjectId))
    .limit(1);
  if (!artifact)
    return c.json(
      {
        error: {
          code: "ARTIFACT_NOT_FOUND",
          message: "Tileset artifact not found",
        },
      },
      404,
    );

  const tileAliasRegistration = await registerPublishedTileAliases({
    storageObject: artifact,
    artifactFormat: targetVersion.format,
    ownerHandle,
    tilesetHandle: tileset.handle,
    version: targetVersion.version,
  });

  const [updated] = await db
    .update(tilesets)
    .set({
      currentVersionId: targetVersion.id,
      status: "READY",
      bounds: targetVersion.bounds,
      minZoom: targetVersion.minZoom,
      maxZoom: targetVersion.maxZoom,
      layerMetadata: targetVersion.schema,
    })
    .where(eq(tilesets.id, id))
    .returning();

  await db
    .update(tilesetVersions)
    .set({ publishedAt: new Date() })
    .where(eq(tilesetVersions.id, targetVersion.id));
  await enqueueOutboxEvent({
    eventName: "tileset.version.published",
    payload: {
      accountId,
      tilesetId: id,
      tilesetVersionId: targetVersion.id,
      publishedBy: userId,
    },
  });
  logAudit({
    profileId: userId,
    action: "tileset.published",
    resourceType: "tileset",
    resourceId: id,
    metadata: buildTilesetPublishAuditMetadata({
      targetVersion: version,
      previousVersion,
      action: publishAction,
      tileAliasRegistration,
    }),
  });

  return c.json({ data: { ...updated, tileAliasRegistration } });
});

resourcesRoute.post("/tilesets/:id/rebuild", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, id),
        eq(tilesets.accountId, accountId),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);
  if (!tileset)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );

  const [upload] = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.accountId, accountId),
        eq(uploads.linkedTilesetId, id),
        isNull(uploads.deletedAt),
      ),
    )
    .orderBy(desc(uploads.createdAt))
    .limit(1);
  if (!upload?.storageObjectId) {
    return c.json(
      {
        error: {
          code: "UPLOAD_NOT_FOUND",
          message: "No original upload is available to rebuild this tileset",
        },
      },
      400,
    );
  }

  const [storageObject] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, upload.storageObjectId))
    .limit(1);
  if (!storageObject) {
    return c.json(
      {
        error: {
          code: "UPLOAD_ARTIFACT_NOT_FOUND",
          message: "Original upload artifact was not found",
        },
      },
      404,
    );
  }
  const sourceAvailability =
    await verifyStorageArtifactAvailable(storageObject);
  if (!sourceAvailability.ok) {
    return c.json(
      {
        error: {
          code:
            sourceAvailability.code === "ARTIFACT_MISSING"
              ? "UPLOAD_ARTIFACT_MISSING"
              : sourceAvailability.code,
          message:
            sourceAvailability.code === "ARTIFACT_MISSING"
              ? "Original upload artifact is missing from storage; re-upload the source before rebuilding."
              : sourceAvailability.message,
        },
      },
      sourceAvailability.code === "ARTIFACT_MISSING" ? 409 : 503,
    );
  }

  const format = detectUploadFormat(
    storageObject.fileName ?? upload.originalFileName,
    upload.contentType ?? storageObject.contentType ?? "",
  );
  if (!format) {
    return c.json(
      {
        error: {
          code: "UNSUPPORTED_UPLOAD",
          message: "Original upload format is no longer supported",
        },
      },
      400,
    );
  }

  const [activeRebuild] = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.accountId, accountId),
        eq(processingJobs.type, "tileset.process_upload"),
        inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
        sql`${processingJobs.input}->>'tilesetId' = ${tileset.id}`,
      ),
    )
    .limit(1);

  if (activeRebuild) {
    return c.json({ data: activeRebuild }, 202);
  }

  let processingJob: typeof processingJobs.$inferSelect;
  try {
    processingJob = await createProcessingJob({
      accountId,
      type: "tileset.process_upload",
      input: {
        tilesetId: tileset.id,
        uploadId: upload.id,
        storageObjectId: storageObject.id,
        uploadKey: storageObject.storageKey,
        format,
        options: {
          minZoom: tileset.minZoom ?? 0,
          maxZoom: tileset.maxZoom ?? 14,
        },
      },
    });
  } catch (err) {
    const response = processingJobLimitResponse(c, err);
    if (response) return response;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tilesets)
      .set({
        status: "BUILDING",
        buildJobId: processingJob.id,
        updatedAt: new Date(),
      })
      .where(eq(tilesets.id, tileset.id));
    await tx
      .update(uploads)
      .set({ status: "VALIDATING", linkedTilesetId: tileset.id })
      .where(eq(uploads.id, upload.id));
  });

  await logProcessingJob(processingJob.id, "Console rebuild requested", {
    metadata: { uploadId: upload.id, tilesetId: tileset.id, format },
  });

  await enqueueOutboxEvent({
    eventName: "tileset.build.requested",
    payload: {
      accountId,
      tilesetId: tileset.id,
      jobId: processingJob.id,
      sourceResourceType: "upload",
      sourceResourceId: upload.id,
      options: {
        minZoom: tileset.minZoom ?? 0,
        maxZoom: tileset.maxZoom ?? 14,
      },
    },
  });

  logAudit({
    profileId: userId,
    action: "tileset.rebuild_requested",
    resourceType: "tileset",
    resourceId: tileset.id,
    metadata: {
      uploadId: upload.id,
      processingJobId: processingJob.id,
      format,
    },
  });

  return c.json({ data: processingJob }, 202);
});

resourcesRoute.get("/jobs", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.accountId, accountId))
    .orderBy(desc(processingJobs.createdAt));
  return c.json({ data: rows });
});

resourcesRoute.get("/jobs/:id", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(eq(processingJobs.id, id), eq(processingJobs.accountId, accountId)),
    )
    .limit(1);
  if (!job)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Job not found" } },
      404,
    );

  const logs = await db
    .select()
    .from(processingJobLogs)
    .where(eq(processingJobLogs.jobId, id))
    .orderBy(desc(processingJobLogs.createdAt));
  return c.json({ data: { ...job, logs: logs.reverse() } });
});

resourcesRoute.post("/jobs/:id/retry", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(eq(processingJobs.id, id), eq(processingJobs.accountId, accountId)),
    )
    .limit(1);

  if (!job)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Job not found" } },
      404,
    );
  if (job.status !== "FAILED" && job.status !== "CANCELED") {
    return c.json(
      {
        error: {
          code: "INVALID_JOB_STATE",
          message: "Only failed or canceled jobs can be retried",
        },
      },
      400,
    );
  }

  let input: SourceProcessingJobInput;
  try {
    input = parseSourceProcessingJobInput(job.input);
  } catch (err) {
    return c.json(
      {
        error: {
          code: "INVALID_JOB_INPUT",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    );
  }
  const now = new Date();

  const updatedJob = await db.transaction(async (tx) => {
    const [transitioned] = await tx
      .update(processingJobs)
      .set({
        status: "PENDING",
        progress: 0,
        output: null,
        errorCode: null,
        errorMessage: null,
        retryCount: sql<number>`${processingJobs.retryCount} + 1`,
        cancelRequestedAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(processingJobs.id, job.id),
          eq(processingJobs.accountId, accountId),
          inArray(processingJobs.status, ["FAILED", "CANCELED"]),
        ),
      )
      .returning();

    if (!transitioned) return null;

    await tx.insert(processingJobLogs).values({
      jobId: job.id,
      level: "info",
      message: "Console retry requested",
      metadata: { previousStatus: job.status },
    });

    await tx
      .update(tilesets)
      .set({ status: "BUILDING", buildJobId: job.id, updatedAt: now })
      .where(
        and(
          eq(tilesets.id, input.tilesetId),
          eq(tilesets.accountId, accountId),
        ),
      );

    if (input.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "VALIDATING", linkedTilesetId: input.tilesetId })
        .where(
          and(eq(uploads.id, input.uploadId), eq(uploads.accountId, accountId)),
        );
    }

    return transitioned;
  });

  if (!updatedJob) {
    return c.json(
      {
        error: {
          code: "INVALID_JOB_STATE",
          message: "Only failed or canceled jobs can be retried",
        },
      },
      409,
    );
  }

  const retrySource = buildRetrySourceResource(input);
  await enqueueOutboxEvent({
    eventName: "tileset.build.requested",
    payload: {
      accountId,
      tilesetId: input.tilesetId,
      jobId: job.id,
      sourceResourceType: retrySource.sourceResourceType,
      sourceResourceId: retrySource.sourceResourceId,
      options: input.options,
    },
  });

  await logProcessingJob(job.id, "Tileset build retry queued", {
    metadata: { requestedBy: "console", previousStatus: job.status },
  });

  return c.json({ data: updatedJob });
});

resourcesRoute.post("/jobs/:id/cancel", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const now = new Date();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(eq(processingJobs.id, id), eq(processingJobs.accountId, accountId)),
    )
    .limit(1);

  if (!job)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Job not found" } },
      404,
    );
  if (["SUCCEEDED", "FAILED", "CANCELED"].includes(job.status)) {
    return c.json(
      {
        error: {
          code: "INVALID_JOB_STATE",
          message: "Completed jobs cannot be canceled",
        },
      },
      400,
    );
  }

  const [updated] = await db
    .update(processingJobs)
    .set({
      status: sql<
        typeof processingJobs.status
      >`case when ${processingJobs.status} = 'PENDING' then 'CANCELED' else ${processingJobs.status} end`,
      cancelRequestedAt: now,
      completedAt: sql<
        Date | null
      >`case when ${processingJobs.status} = 'PENDING' then ${now} else ${processingJobs.completedAt} end`,
      updatedAt: now,
    })
    .where(
      and(
        eq(processingJobs.id, id),
        eq(processingJobs.accountId, accountId),
        inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
      ),
    )
    .returning();

  if (!updated) {
    return c.json(
      {
        error: {
          code: "INVALID_JOB_STATE",
          message: "Completed jobs cannot be canceled",
        },
      },
      409,
    );
  }

  const previousStatus =
    updated.status === "CANCELED" ? "PENDING" : updated.status;
  await logProcessingJob(
    id,
    previousStatus === "PENDING"
      ? "Console canceled pending job"
      : "Console cancellation requested",
    {
      level: "warn",
      metadata: { previousStatus },
    },
  );

  return c.json({ data: updated });
});

resourcesRoute.get("/tilesets/:id/artifact", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(and(eq(tilesets.id, id), eq(tilesets.accountId, accountId)))
    .limit(1);
  if (!tileset?.currentVersionId)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Published tileset not found" } },
      404,
    );

  const [version] = await db
    .select()
    .from(tilesetVersions)
    .where(eq(tilesetVersions.id, tileset.currentVersionId))
    .limit(1);
  if (!version?.artifactStorageObjectId)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Artifact not found" } },
      404,
    );

  const [object] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, version.artifactStorageObjectId))
    .limit(1);
  if (!object)
    return c.json(
      { error: { code: "NOT_FOUND", message: "Artifact not found" } },
      404,
    );

  return c.json({
    data: {
      url: getStorage().getUrl(object.storageKey),
      storageKey: object.storageKey,
      format: version.format,
    },
  });
});

async function getOwnerHandle(accountId: string) {
  const [owner] = await db
    .select({ handle: accounts.handle })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
    .limit(1);

  return owner?.handle ?? null;
}

function versionsForTileset(
  versions: Array<typeof tilesetVersions.$inferSelect>,
  tilesetId: string,
) {
  return versions.filter((version) => version.tilesetId === tilesetId);
}

function uploadsForTileset(
  rows: Array<typeof uploads.$inferSelect>,
  tilesetId: string,
) {
  return rows.filter((upload) => upload.linkedTilesetId === tilesetId);
}

async function fetchArtifactMap(
  versions: Array<typeof tilesetVersions.$inferSelect>,
) {
  const artifactIds = versions
    .map((version) => version.artifactStorageObjectId)
    .filter((id): id is string => Boolean(id));
  if (artifactIds.length === 0) return new Map<string, ConsoleArtifact>();

  const rows = await db
    .select()
    .from(storageObjects)
    .where(inArray(storageObjects.id, artifactIds));
  const storage = getStorage();
  const entries = await Promise.all(
    rows.map(
      async (object) =>
        [
          object.id,
          {
            id: object.id,
            provider: object.provider,
            bucket: object.bucket,
            storageKey: object.storageKey,
            fileName: object.fileName,
            contentType: object.contentType,
            size: object.size,
            url: storage.getUrl(object.storageKey),
            availability: await verifyStorageArtifactAvailable(object, storage),
          },
        ] as const,
    ),
  );
  return new Map(entries);
}

async function fetchUploadArtifactAvailabilityMap(
  uploadRows: Array<typeof uploads.$inferSelect>,
) {
  const storageObjectIds = uploadRows
    .map((upload) => upload.storageObjectId)
    .filter((id): id is string => Boolean(id));
  const objectRows =
    storageObjectIds.length > 0
      ? await db
          .select()
          .from(storageObjects)
          .where(inArray(storageObjects.id, storageObjectIds))
      : [];
  const objectById = new Map(objectRows.map((object) => [object.id, object]));
  const storage = getStorage();
  const entries: Array<readonly [string, ConsoleArtifactAvailability]> =
    await Promise.all(
      uploadRows.map(async (upload) => {
        if (!upload.storageObjectId) {
          return [
            upload.id,
            {
              ok: false,
              code: "UPLOAD_ARTIFACT_NOT_FOUND",
              message: "Original upload artifact was not recorded.",
            },
          ] as const;
        }
        const object = objectById.get(upload.storageObjectId);
        if (!object) {
          return [
            upload.id,
            {
              ok: false,
              code: "UPLOAD_ARTIFACT_NOT_FOUND",
              message: "Original upload artifact record was not found.",
            },
          ] as const;
        }
        const availability = await verifyStorageArtifactAvailable(
          object,
          storage,
        );
        return [upload.id, availability] as const;
      }),
    );
  return new Map(entries);
}

function toConsoleTileset(
  tileset: typeof tilesets.$inferSelect,
  ownerHandle: string | null,
  versions: Array<typeof tilesetVersions.$inferSelect>,
  params: {
    uploads?: Array<typeof uploads.$inferSelect>;
    artifactById?: Map<string, ConsoleArtifact>;
    uploadAvailabilityById?: Map<string, ConsoleArtifactAvailability>;
  } = {},
) {
  const currentVersion =
    versions.find((version) => version.id === tileset.currentVersionId) ?? null;
  const consoleVersions = versions.map((version) =>
    toConsoleTilesetVersion(version, params.artifactById),
  );
  const currentConsoleVersion =
    consoleVersions.find(
      (version) => version.id === tileset.currentVersionId,
    ) ?? null;
  const latestConsoleVersion = consoleVersions[0] ?? null;
  const consoleUploads = (params.uploads ?? []).map((upload) =>
    toConsoleUpload(upload, params.uploadAvailabilityById),
  );
  const tilejsonUrl =
    ownerHandle && currentVersion
      ? `/tiles/v1/${ownerHandle}/${tileset.handle}.json`
      : null;

  return {
    ...tileset,
    ownerHandle,
    uploads: consoleUploads,
    latestUpload: consoleUploads[0] ?? null,
    versions: consoleVersions,
    latestVersion: latestConsoleVersion,
    currentVersion: currentConsoleVersion,
    isPublished: Boolean(currentVersion),
    tilejsonUrl,
    versionedTilejsonUrl:
      ownerHandle && currentVersion
        ? `/tiles/v1/${ownerHandle}/${tileset.handle}/versions/${currentVersion.version}.json`
        : null,
  };
}

function toConsoleUpload(
  upload: typeof uploads.$inferSelect,
  availabilityById?: Map<string, ConsoleArtifactAvailability>,
) {
  return {
    ...upload,
    artifactAvailability: availabilityById?.get(upload.id) ?? null,
  };
}

function toConsoleTilesetVersion(
  version: typeof tilesetVersions.$inferSelect,
  artifactById?: Map<string, ConsoleArtifact>,
) {
  return {
    ...version,
    artifact: version.artifactStorageObjectId
      ? (artifactById?.get(version.artifactStorageObjectId) ?? null)
      : null,
  };
}

function processingJobLimitResponse(c: Context, err: unknown) {
  if (!(err instanceof ActiveProcessingJobLimitError)) return null;
  return c.json(
    {
      error: {
        code: err.code,
        message: `Too many active processing jobs (${err.current}/${err.limit}). Wait for a job to finish before queueing more work.`,
      },
    },
    429,
  );
}

type ConsoleArtifact = {
  id: string;
  provider: string;
  bucket: string | null;
  storageKey: string;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  url: string;
  availability: ConsoleArtifactAvailability;
};

type ConsoleArtifactAvailability =
  | { ok: true }
  | { ok: false; code: string; message: string };
