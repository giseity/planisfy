import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth";
import { checkResourceLimit } from "../lib/plan-check";
import {
  db,
  tilesetSources,
  auditEvents,
  uploads,
  processingJobs,
  processingJobLogs,
} from "@planisfy/database";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getStorage } from "../lib/storage";
import {
  enqueueSourceProcessing,
  type SourceProcessingJob,
} from "../lib/source-queue";
import { StoragePaths } from "@planisfy/storage-paths";
import { enqueueOutboxEvent } from "../lib/outbox";
import { createProcessingJob, logProcessingJob } from "../lib/processing-jobs";
import { recordStorageObject } from "../lib/storage-ledger";

export const sourcesRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

const createSourceSchema = z.object({
  name: z.string().min(1).max(128),
  handle: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  type: z.enum(["VECTOR", "RASTER", "GEOJSON", "IMAGE", "VIDEO"]).optional(),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(128).optional(),
});

// ── GET /sources — List sources for current owner ───────────────────────────

sourcesRoute.get("/sources", async (c) => {
  const ownerId = c.get("ownerId");

  const sources = await db
    .select()
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .orderBy(desc(tilesetSources.createdAt));

  return c.json(sources);
});

// ── POST /sources — Create a new source ─────────────────────────────────────

sourcesRoute.post("/sources", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = createSourceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      400,
    );
  }

  const planCheck = await checkResourceLimit(userId, ownerId, "sources");
  if (!planCheck.allowed) {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${planCheck.limit} sources on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }

  const { name, handle, type } = parsed.data;

  // Check for duplicate handle
  const [existing] = await db
    .select({ id: tilesetSources.id })
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.ownerId, ownerId),
        eq(tilesetSources.handle, handle),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "Source with this handle already exists",
        },
      },
      409,
    );
  }

  const [source] = await db
    .insert(tilesetSources)
    .values({
      ownerId,
      name,
      handle,
      type: type || "GEOJSON",
      url: "", // Will be set after upload processing
      status: "PENDING",
    })
    .returning();

  // Audit
  await db.insert(auditEvents).values({
    profileId: userId,
    action: "source.created",
    resourceType: "source",
    resourceId: source!.id,
    ipAddress:
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json(source!, 201);
});

// ── GET /sources/:id — Get source details ───────────────────────────────────

sourcesRoute.get("/sources/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const { id } = c.req.param();

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.id, id),
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source not found" } },
      404,
    );
  }

  return c.json(source);
});

// ── PUT /sources/:id — Update source metadata ──────────────────────────────

sourcesRoute.put("/sources/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const { id } = c.req.param();
  const body = await c.req.json();

  const parsed = updateSourceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      400,
    );
  }

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.id, id),
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source not found" } },
      404,
    );
  }

  const [updated] = await db
    .update(tilesetSources)
    .set(parsed.data)
    .where(eq(tilesetSources.id, id))
    .returning();

  await db.insert(auditEvents).values({
    profileId: userId,
    action: "source.updated",
    resourceType: "source",
    resourceId: id,
    ipAddress:
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json(updated);
});

// ── DELETE /sources/:id — Soft delete source ────────────────────────────────

sourcesRoute.delete("/sources/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const { id } = c.req.param();

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.id, id),
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source not found" } },
      404,
    );
  }

  await db
    .update(tilesetSources)
    .set({ deletedAt: new Date() })
    .where(eq(tilesetSources.id, id));

  await enqueueOutboxEvent({
    eventName: "artifact.cleanup.requested",
    payload: {
      resourceType: "tileset_source",
      resourceId: id,
      reason: "source.deleted",
    },
  });

  await db.insert(auditEvents).values({
    profileId: userId,
    action: "source.deleted",
    resourceType: "source",
    resourceId: id,
    ipAddress:
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json({ ok: true });
});

// ── POST /sources/:id/upload — Upload data file for processing ──────────────

sourcesRoute.post("/sources/:id/upload", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const { id } = c.req.param();

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.id, id),
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source not found" } },
      404,
    );
  }

  if (source.status === "PROCESSING") {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "Source is already being processed",
        },
      },
      409,
    );
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

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

  // Detect format from filename or content type
  const filename = file.name || "upload";
  const format = detectFormat(filename, file.type);

  if (!format) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Unsupported file format. Accepted: .geojson, .json, .csv, .pmtiles",
        },
      },
      400,
    );
  }

  const storageFileName = toStorageFileName(filename);

  const [upload] = await db
    .insert(uploads)
    .values({
      accountId: ownerId,
      originalFileName: filename,
      contentType: file.type || null,
      size: file.size,
      status: "PENDING",
    })
    .returning();

  if (!upload) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create upload record",
        },
      },
      500,
    );
  }

  // Store raw upload through the shared storage path contract.
  const storage = getStorage();
  const uploadKey = StoragePaths.uploadOriginal(
    ownerId,
    upload.id,
    storageFileName,
  );
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storage.upload(uploadKey, buffer, file.type);
  const storageInfo = storage.getInfo();

  const storageObject = await recordStorageObject({
    accountId: ownerId,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey: uploadKey,
    fileName: storageFileName,
    contentType: stored.contentType,
    size: stored.size,
    resourceType: "upload",
    resourceId: upload.id,
    artifactKind: "original",
    metadata: {
      originalFileName: filename,
      sourceId: id,
    },
  });

  await db
    .update(uploads)
    .set({
      status: "UPLOADED",
      storageObjectId: storageObject.id,
    })
    .where(eq(uploads.id, upload.id));

  const processingJob = await createProcessingJob({
    accountId: ownerId,
    type: "tileset_source.process_upload",
    input: {
      sourceId: id,
      uploadId: upload.id,
      storageObjectId: storageObject.id,
      uploadKey,
      format,
      options: {
        minZoom: source.minZoom ?? 0,
        maxZoom: source.maxZoom ?? 14,
      },
    },
  });

  await enqueueOutboxEvent({
    eventName: "upload.created",
    payload: {
      uploadId: upload.id,
      accountId: ownerId,
      storageObjectId: storageObject.id,
    },
  });

  await logProcessingJob(processingJob.id, "Source upload received", {
    metadata: {
      sourceId: id,
      uploadId: upload.id,
      storageObjectId: storageObject.id,
      uploadKey,
      format,
    },
  });

  // Update status to PENDING and enqueue processing job
  await db
    .update(tilesetSources)
    .set({ status: "PENDING" })
    .where(eq(tilesetSources.id, id));

  enqueueSourceProcessing({
    sourceId: id,
    ownerId,
    uploadKey,
    uploadId: upload.id,
    storageObjectId: storageObject.id,
    processingJobId: processingJob.id,
    format,
    options: {
      minZoom: source.minZoom ?? 0,
      maxZoom: source.maxZoom ?? 14,
    },
  });

  await db.insert(auditEvents).values({
    profileId: userId,
    action: "source.upload",
    resourceType: "source",
    resourceId: id,
    metadata: {
      filename,
      storageFileName,
      size: file.size,
      format,
      uploadId: upload.id,
      storageObjectId: storageObject.id,
      processingJobId: processingJob.id,
    },
    ipAddress:
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json({
    ok: true,
    sourceId: id,
    status: "PENDING",
    message: "File uploaded, processing started",
    uploadId: upload.id,
    processingJobId: processingJob.id,
  });
});

// ── GET /sources/:id/processing — Latest processing job and logs ───────────

sourcesRoute.get("/sources/:id/processing", async (c) => {
  const ownerId = c.get("ownerId");
  const { id } = c.req.param();

  const [source] = await db
    .select({ id: tilesetSources.id })
    .from(tilesetSources)
    .where(
      and(
        eq(tilesetSources.id, id),
        eq(tilesetSources.ownerId, ownerId),
        isNull(tilesetSources.deletedAt),
      ),
    )
    .limit(1);

  if (!source) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Source not found" } },
      404,
    );
  }

  const jobs = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.accountId, ownerId))
    .orderBy(desc(processingJobs.createdAt))
    .limit(25);
  const job = jobs.find((candidate) => {
    const input = candidate.input as { sourceId?: string } | null;
    return input?.sourceId === id;
  });

  if (!job) {
    return c.json({ data: null });
  }

  const logs = await db
    .select()
    .from(processingJobLogs)
    .where(eq(processingJobLogs.jobId, job.id))
    .orderBy(desc(processingJobLogs.createdAt));

  const input = job.input as { uploadId?: string } | null;

  return c.json({
    data: {
      id: job.id,
      sourceId: id,
      uploadId: input?.uploadId ?? null,
      status: job.status,
      progress: job.progress,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      logs: logs.reverse(),
    },
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectFormat(
  filename: string,
  mimeType: string,
): SourceProcessingJob["format"] | null {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "geojson":
    case "json":
      return "geojson";
    case "csv":
      return "csv";
    case "pmtiles":
      return "pmtiles";
    default:
      break;
  }

  if (mimeType.includes("geo+json") || mimeType.includes("json"))
    return "geojson";
  if (mimeType.includes("csv")) return "csv";

  return null;
}

function toStorageFileName(filename: string): string {
  const fallback = "upload";
  const normalized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized || normalized === "." || normalized === "..") {
    return fallback;
  }

  return normalized;
}
