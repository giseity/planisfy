import { Hono } from "hono";
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
import { createProcessingJob, logProcessingJob } from "../lib/processing-jobs";
import { recordStorageObject } from "../lib/storage-ledger";
import { logAudit } from "../lib/audit";
import { registerPublishedMartinSources } from "../lib/martin-sources";
import { enqueueOutboxEvent } from "../lib/outbox";
import { checkResourceLimit } from "../lib/plan-check";

export const resourcesRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_SIZE = 250 * 1024 * 1024;
type UploadFormat = "geojson" | "csv" | "shapefile" | "pmtiles" | "mbtiles";

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

  const format = detectFormat(file.name, file.type);
  if (!format) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Unsupported file format. Accepted: GeoJSON, CSV, zipped Shapefile, PMTiles, MBTiles.",
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

  const processingJob = await createProcessingJob({
    accountId,
    type: "tileset.process_upload",
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

  await logProcessingJob(processingJob.id, "Upload received and queued", {
    metadata: { uploadId: upload.id, tilesetId: tileset.id, uploadKey, format },
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
          .where(inArray(tilesetVersions.tilesetId, rows.map((row) => row.id)))
          .orderBy(desc(tilesetVersions.version))
      : [];

  return c.json({
    data: rows.map((row) =>
      toConsoleTileset(row, ownerHandle, versionsForTileset(versions, row.id)),
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

  return c.json({
    data: toConsoleTileset(tileset, ownerHandle, versions),
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

  const martinRegistration = await registerPublishedMartinSources({
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
    metadata: { version, martinRegistration },
  });

  return c.json({ data: { ...updated, martinRegistration } });
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

  await db.transaction(async (tx) => {
    await tx
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
      .where(eq(processingJobs.id, job.id));

    await tx.insert(processingJobLogs).values({
      jobId: job.id,
      level: "info",
      message: "Console retry requested",
      metadata: { previousStatus: job.status },
    });

    await tx
      .update(tilesets)
      .set({ status: "BUILDING", updatedAt: now })
      .where(
        and(eq(tilesets.id, input.tilesetId), eq(tilesets.accountId, accountId)),
      );

    if (input.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "VALIDATING", linkedTilesetId: input.tilesetId })
        .where(
          and(eq(uploads.id, input.uploadId), eq(uploads.accountId, accountId)),
        );
    }
  });

  await enqueueOutboxEvent({
    eventName: "tileset.build.requested",
    payload: {
      accountId,
      tilesetId: input.tilesetId,
      jobId: job.id,
      sourceResourceType: "upload",
      sourceResourceId: input.uploadId,
      options: input.options,
    },
  });

  await logProcessingJob(job.id, "Tileset build retry queued", {
    metadata: { requestedBy: "console", previousStatus: job.status },
  });

  const [updated] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, job.id))
    .limit(1);

  return c.json({ data: updated });
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
      status: job.status === "PENDING" ? "CANCELED" : job.status,
      cancelRequestedAt: now,
      completedAt: job.status === "PENDING" ? now : job.completedAt,
      updatedAt: now,
    })
    .where(eq(processingJobs.id, id))
    .returning();

  await logProcessingJob(
    id,
    job.status === "PENDING"
      ? "Console canceled pending job"
      : "Console cancellation requested",
    {
      level: "warn",
      metadata: { previousStatus: job.status },
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

function detectFormat(filename: string, mimeType: string): UploadFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "geojson" || ext === "json") return "geojson";
  if (ext === "csv") return "csv";
  if (ext === "zip") return "shapefile";
  if (ext === "pmtiles") return "pmtiles";
  if (ext === "mbtiles") return "mbtiles";
  if (mimeType.includes("geo+json") || mimeType.includes("json"))
    return "geojson";
  if (mimeType.includes("csv")) return "csv";
  if (mimeType.includes("zip")) return "shapefile";
  return null;
}

function toStorageFileName(filename: string): string {
  const normalized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized && normalized !== "." && normalized !== ".."
    ? normalized
    : "upload";
}

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

function toConsoleTileset(
  tileset: typeof tilesets.$inferSelect,
  ownerHandle: string | null,
  versions: Array<typeof tilesetVersions.$inferSelect>,
) {
  const currentVersion =
    versions.find((version) => version.id === tileset.currentVersionId) ?? null;
  const latestVersion = versions[0] ?? null;
  const tilejsonUrl =
    ownerHandle && currentVersion
      ? `/tiles/v1/${ownerHandle}/${tileset.handle}.json`
      : null;

  return {
    ...tileset,
    ownerHandle,
    versions,
    latestVersion,
    currentVersion,
    isPublished: Boolean(currentVersion),
    tilejsonUrl,
    versionedTilejsonUrl:
      ownerHandle && currentVersion
        ? `/tiles/v1/${ownerHandle}/${tileset.handle}/versions/${currentVersion.version}.json`
        : null,
  };
}

type SourceProcessingJobInput = {
  tilesetId: string;
  uploadId: string;
  uploadKey: string;
  format: UploadFormat;
  csv?: {
    latitude?: string;
    longitude?: string;
  };
  options?: Record<string, unknown>;
};

function parseSourceProcessingJobInput(input: unknown): SourceProcessingJobInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("Processing job input is missing");
  }

  const candidate = input as Partial<SourceProcessingJobInput>;
  if (
    !candidate.tilesetId ||
    !candidate.uploadId ||
    !candidate.uploadKey ||
    !candidate.format
  ) {
    throw new Error("Processing job input cannot reconstruct a tileset build request");
  }

  if (
    !["geojson", "csv", "shapefile", "pmtiles", "mbtiles"].includes(
      candidate.format,
    )
  ) {
    throw new Error("Processing job input has an unsupported source format");
  }

  return {
    tilesetId: candidate.tilesetId,
    uploadId: candidate.uploadId,
    uploadKey: candidate.uploadKey,
    format: candidate.format,
    csv: candidate.csv,
    options: candidate.options,
  };
}
