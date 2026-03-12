import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth";
import { db, tilesetSources, auditEvents } from "@planisfy/database";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getStorage } from "../lib/storage";
import { enqueueSourceProcessing, type SourceProcessingJob } from "../lib/source-queue";
import { randomUUID } from "crypto";

export const sourcesRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

const createSourceSchema = z.object({
  name: z.string().min(1).max(128),
  handle: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
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
    .where(and(eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt)))
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
    return c.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } }, 400);
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
        isNull(tilesetSources.deletedAt)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ error: { code: "CONFLICT", message: "Source with this handle already exists" } }, 409);
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
    resourceId: source.id,
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json(source, 201);
});

// ── GET /sources/:id — Get source details ───────────────────────────────────

sourcesRoute.get("/sources/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const { id } = c.req.param();

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(eq(tilesetSources.id, id), eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt))
    )
    .limit(1);

  if (!source) {
    return c.json({ error: { code: "NOT_FOUND", message: "Source not found" } }, 404);
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
    return c.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } }, 400);
  }

  const [source] = await db
    .select()
    .from(tilesetSources)
    .where(
      and(eq(tilesetSources.id, id), eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt))
    )
    .limit(1);

  if (!source) {
    return c.json({ error: { code: "NOT_FOUND", message: "Source not found" } }, 404);
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
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
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
      and(eq(tilesetSources.id, id), eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt))
    )
    .limit(1);

  if (!source) {
    return c.json({ error: { code: "NOT_FOUND", message: "Source not found" } }, 404);
  }

  await db
    .update(tilesetSources)
    .set({ deletedAt: new Date() })
    .where(eq(tilesetSources.id, id));

  // Clean up storage (fire and forget)
  const storage = getStorage();
  storage.delete(`sources/${ownerId}/${id}`).catch(() => {});
  storage.delete(`uploads/${ownerId}/${id}`).catch(() => {});

  await db.insert(auditEvents).values({
    profileId: userId,
    action: "source.deleted",
    resourceType: "source",
    resourceId: id,
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
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
      and(eq(tilesetSources.id, id), eq(tilesetSources.ownerId, ownerId), isNull(tilesetSources.deletedAt))
    )
    .limit(1);

  if (!source) {
    return c.json({ error: { code: "NOT_FOUND", message: "Source not found" } }, 404);
  }

  if (source.status === "PROCESSING") {
    return c.json({ error: { code: "CONFLICT", message: "Source is already being processed" } }, 409);
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No file provided" } }, 400);
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: `File too large (max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB)` } }, 400);
  }

  // Detect format from filename or content type
  const filename = file.name || "upload";
  const format = detectFormat(filename, file.type);

  if (!format) {
    return c.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Unsupported file format. Accepted: .geojson, .json, .csv, .pmtiles",
      },
    }, 400);
  }

  // Store raw upload
  const storage = getStorage();
  const uploadKey = `uploads/${ownerId}/${id}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.upload(uploadKey, buffer, file.type);

  // Update status to PENDING and enqueue processing job
  await db
    .update(tilesetSources)
    .set({ status: "PENDING" })
    .where(eq(tilesetSources.id, id));

  enqueueSourceProcessing({
    sourceId: id,
    ownerId,
    uploadKey,
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
    metadata: { filename, size: file.size, format },
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null,
  });

  return c.json({
    ok: true,
    sourceId: id,
    status: "PENDING",
    message: "File uploaded, processing started",
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectFormat(filename: string, mimeType: string): SourceProcessingJob["format"] | null {
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

  if (mimeType.includes("geo+json") || mimeType.includes("json")) return "geojson";
  if (mimeType.includes("csv")) return "csv";

  return null;
}
