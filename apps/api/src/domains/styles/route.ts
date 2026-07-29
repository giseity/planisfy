import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  spriteAssets,
  storageObjects,
  styles,
  stylePublications,
  styleVersions,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import { StoragePaths } from "@planisfy/storage-paths";
import { validateMapLibreStyle } from "@planisfy/style-spec";
import {
  createStyleRecord,
  duplicateStyleRecord,
  restoreStyleRevision,
  softDeleteStyleRecord,
  StyleCreationError,
  StyleRevisionError,
  updateStyleRevision,
} from "@planisfy/database/styles/service";
import { logAudit } from "../../shared/audit";
import { getAccountPlanLimits } from "../billing/billing";
import { requireOrgMutationPermission, type AuthEnv } from "../../middleware/auth";
import { recordStorageObject } from "../../shared/storage/storage-ledger";
import {
  consumeSpritePublicationRateLimit,
  consumeSpriteUploadRateLimit,
} from "../../middleware/rate-limit";
import {
  consumeMultipartRequest,
  MultipartRequestError,
} from "../../shared/http/multipart";
import {
  buildSpriteSheet,
  extractSpriteImageIds,
  normalizeSpriteAssetUpload,
  SpriteAssetValidationError,
  spriteIdForStyleVersion,
  spriteStorageKeys,
  validateSpriteAssetFolder,
  styleReferencesSpriteAssets,
  validateSpriteAssetName,
  validateSpritePngUpload,
  SPRITE_ASSET_MAX_BYTES,
  SPRITE_ATLAS_MAX_ASSETS,
  SPRITE_ATLAS_MAX_JSON_BYTES,
  SPRITE_NORMALIZED_MAX_BYTES,
  type PublishedSpriteMetadata,
} from "./style-sprites";

export const stylesRoute = new Hono<AuthEnv>();

const SPRITE_MULTIPART_MAX_BYTES = 600 * 1024;
const SPRITE_ACCOUNT_MAX_ASSETS = 256;
const SPRITE_ACCOUNT_MAX_BYTES = 128 * 1024 * 1024;

stylesRoute.use("/styles", requireOrgMutationPermission("resource.write"));
stylesRoute.use("/styles/*", requireOrgMutationPermission("resource.write"));
stylesRoute.use("/sprite-assets", requireOrgMutationPermission("resource.write"));
stylesRoute.use(
  "/sprite-assets/*",
  requireOrgMutationPermission("resource.write"),
);

// ── Helpers ─────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

// ── Validation schemas ──────────────────────────────────────────────────────

const createStyleSchema = z.object({
  name: z.string().min(1).max(128),
  handle: z.string().max(64).optional(),
  description: z.string().max(1000).optional(),
  styleJson: z.record(z.string(), z.unknown()),
});

const updateStyleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1000).optional(),
  styleJson: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().positive(),
});

const restoreStyleSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

const renameSpriteAssetSchema = z.object({
  name: z.string().min(1).max(96).optional(),
  folder: z.string().max(128).optional(),
  description: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().min(1).max(48)).max(20).optional(),
});

// ── Account sprite assets ──────────────────────────────────────────────────

stylesRoute.get("/sprite-assets", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select({
      id: spriteAssets.id,
      name: spriteAssets.name,
      folder: spriteAssets.folder,
      description: spriteAssets.description,
      sourceFormat: spriteAssets.sourceFormat,
      width: spriteAssets.width,
      height: spriteAssets.height,
      metadata: spriteAssets.metadata,
      createdAt: spriteAssets.createdAt,
      updatedAt: spriteAssets.updatedAt,
      storageObjectId: spriteAssets.storageObjectId,
      rasterStorageObjectId: spriteAssets.rasterStorageObjectId,
      storageKey: storageObjects.storageKey,
      size: storageObjects.size,
    })
    .from(spriteAssets)
    .innerJoin(storageObjects, eq(spriteAssets.storageObjectId, storageObjects.id))
    .where(and(eq(spriteAssets.accountId, accountId), isNull(spriteAssets.deletedAt)))
    .orderBy(spriteAssets.folder, spriteAssets.name);

  return c.json({
    data: rows.map(serializeSpriteAsset),
  });
});

stylesRoute.post("/sprite-assets", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const retryAfter = await consumeSpriteUploadRateLimit(accountId);
  if (retryAfter !== null) {
    c.header("Retry-After", String(retryAfter));
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many sprite uploads. Please try again later.",
        },
      },
      429,
    );
  }

  let uploadedFile:
    | {
        data: Buffer;
        contentType: string;
        fileName: string;
      }
    | undefined;
  let body: Record<string, string>;
  try {
    body = await consumeMultipartRequest({
      request: c.req.raw,
      maxTotalBytes: SPRITE_MULTIPART_MAX_BYTES,
      maxFileBytes: SPRITE_ASSET_MAX_BYTES,
      maxFiles: 1,
      maxFields: 4,
      maxFieldBytes: 16 * 1024,
      timeoutMs: 30_000,
      onFile: async (file) => {
        if (file.fieldName !== "file" || uploadedFile) {
          throw new MultipartRequestError(
            "INVALID_MULTIPART",
            "Sprite upload must contain exactly one 'file' part.",
          );
        }
        const chunks: Buffer[] = [];
        for await (const chunk of file.stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        uploadedFile = {
          data: Buffer.concat(chunks),
          contentType: file.contentType,
          fileName: file.fileName,
        };
      },
    });
  } catch (err) {
    if (!(err instanceof MultipartRequestError)) throw err;
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.code === "MULTIPART_LIMIT" ? 413 : 400,
    );
  }

  const name = String(body.name ?? "").trim();
  const folder = normalizeSpriteFolder(body.folder) ?? "";
  const description = normalizeOptionalString(body.description, 500);
  const tags = parseSpriteTags(body.tags);

  if (!validateSpriteAssetName(name) || !validateSpriteAssetFolder(folder)) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Sprite asset names and folders can contain letters, numbers, spaces, dot, underscore, slash, or dash.",
        },
      },
      400,
    );
  }
  if (!uploadedFile) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "PNG or SVG file is required",
        },
      },
      400,
    );
  }

  let normalized: Awaited<ReturnType<typeof normalizeSpriteAssetUpload>>;
  try {
    normalized = await normalizeSpriteAssetUpload({
      buffer: uploadedFile.data,
      contentType: uploadedFile.contentType || null,
      fileName: uploadedFile.fileName,
      size: uploadedFile.data.byteLength,
    });
  } catch (err) {
    if (err instanceof SpriteAssetValidationError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        400,
      );
    }
    throw err;
  }

  const assetId = randomUUID();
  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const fileName = `${name}.${normalized.format}`;
  const storageKey = StoragePaths.accountSpriteAsset(
    accountId,
    assetId,
    fileName,
  );
  const rasterFileName = `${name}.png`;
  const rasterStorageKey =
    normalized.format === "png"
      ? storageKey
      : StoragePaths.accountSpriteAsset(accountId, assetId, rasterFileName);
  const stagedKeys = [storageKey];
  if (rasterStorageKey !== storageKey) stagedKeys.push(rasterStorageKey);
  let stored;
  let rasterStored;
  try {
    stored = await storage.upload(
      storageKey,
      normalized.sourceBuffer,
      normalized.contentType,
    );
    rasterStored =
      normalized.format === "png"
        ? stored
        : await storage.upload(
            rasterStorageKey,
            normalized.rasterBuffer,
            normalized.rasterContentType,
          );
  } catch (err) {
    await Promise.all(stagedKeys.map((key) => storage.delete(key).catch(() => undefined)));
    throw err;
  }

  let created;
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`spriteQuota:${accountId}`}))`,
      );
      const activeAssets = await tx
        .select({
          id: spriteAssets.id,
          storageObjectId: spriteAssets.storageObjectId,
          rasterStorageObjectId: spriteAssets.rasterStorageObjectId,
          name: spriteAssets.name,
        })
        .from(spriteAssets)
        .where(
          and(
            eq(spriteAssets.accountId, accountId),
            isNull(spriteAssets.deletedAt),
          ),
        );
      if (activeAssets.some((asset) => asset.name === name)) {
        throw new SpriteAssetValidationError(
          "SPRITE_NAME_CONFLICT",
          "A sprite asset with that name already exists.",
        );
      }
      if (activeAssets.length >= SPRITE_ACCOUNT_MAX_ASSETS) {
        throw new SpriteAssetValidationError(
          "SPRITE_QUOTA",
          `An account can store at most ${SPRITE_ACCOUNT_MAX_ASSETS} active sprite assets.`,
        );
      }
      const activeObjectIds = [
        ...new Set(
          activeAssets.flatMap((asset) =>
            [asset.storageObjectId, asset.rasterStorageObjectId].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ),
      ];
      const activeObjects =
        activeObjectIds.length === 0
          ? []
          : await tx
              .select({ size: storageObjects.size })
              .from(storageObjects)
              .where(
                and(
                  inArray(storageObjects.id, activeObjectIds),
                  isNull(storageObjects.deletedAt),
                ),
              );
      const activeBytes = activeObjects.reduce(
        (total, object) => total + (object.size ?? 0),
        0,
      );
      const stagedBytes =
        stored.size + (rasterStorageKey === storageKey ? 0 : rasterStored.size);
      if (activeBytes + stagedBytes > SPRITE_ACCOUNT_MAX_BYTES) {
        throw new SpriteAssetValidationError(
          "SPRITE_QUOTA",
          `Active sprite assets cannot exceed ${SPRITE_ACCOUNT_MAX_BYTES} stored bytes per account.`,
        );
      }

    const [storageObject] = await tx
      .insert(storageObjects)
      .values({
        accountId,
        provider: storageInfo.provider,
        bucket: storageInfo.bucket,
        storageKey,
        fileName,
        contentType: stored.contentType,
        size: stored.size,
        resourceType: "sprite_asset",
        resourceId: assetId,
        artifactKind: `original-${normalized.format}`,
        metadata: {
          width: normalized.raster.width,
          height: normalized.raster.height,
          sourceFormat: normalized.format,
        },
      })
      .returning();
    const rasterStorageObject =
      normalized.format === "png"
        ? storageObject!
        : (
            await tx
              .insert(storageObjects)
              .values({
                accountId,
                provider: storageInfo.provider,
                bucket: storageInfo.bucket,
                storageKey: rasterStorageKey,
                fileName: rasterFileName,
                contentType: rasterStored.contentType,
                size: rasterStored.size,
                resourceType: "sprite_asset",
                resourceId: assetId,
                artifactKind: "raster-png",
                metadata: {
                  width: normalized.raster.width,
                  height: normalized.raster.height,
                  sourceFormat: normalized.format,
                },
              })
              .returning()
          )[0]!;

    const [asset] = await tx
      .insert(spriteAssets)
      .values({
        id: assetId,
        accountId,
        name,
        folder,
        description,
        sourceFormat: normalized.format,
        storageObjectId: storageObject!.id,
        rasterStorageObjectId: rasterStorageObject.id,
        width: normalized.raster.width,
        height: normalized.raster.height,
        metadata: { tags },
      })
      .returning();
    return asset!;
    });
  } catch (err) {
    await Promise.all(stagedKeys.map((key) => storage.delete(key).catch(() => undefined)));
    if (err instanceof SpriteAssetValidationError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.code === "SPRITE_NAME_CONFLICT" ? 409 : 403,
      );
    }
    throw err;
  }

  await logAudit({
    accountId,
    actorUserId: userId,
    action: "sprite_asset.created",
    resourceType: "sprite_asset",
    resourceId: created.id,
    metadata: {
      name,
      folder,
      sourceFormat: normalized.format,
      width: created.width,
      height: created.height,
    },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json(
    { data: serializeSpriteAsset(created) },
    201,
  );
});

stylesRoute.get("/sprite-assets/:id/image", async (c) => {
  const accountId = c.get("ownerId");
  const asset = await findSpriteAssetForAccount(accountId, c.req.param("id"));
  if (!asset) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Sprite asset not found" } },
      404,
    );
  }

  const rasterKey = await resolveSpriteRasterStorageKey(asset);
  const data = await getStorage().download(rasterKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
});

stylesRoute.patch("/sprite-assets/:id", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const parsed = renameSpriteAssetSchema.safeParse(await c.req.json());
  const nextName = parsed.success ? parsed.data.name?.trim() : undefined;
  const nextFolder =
    parsed.success && parsed.data.folder !== undefined
      ? normalizeSpriteFolder(parsed.data.folder)
      : undefined;
  if (
    !parsed.success ||
    (nextName !== undefined && !validateSpriteAssetName(nextName)) ||
    (nextFolder !== undefined && !validateSpriteAssetFolder(nextFolder))
  ) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Sprite asset names and folders can contain letters, numbers, spaces, dot, underscore, slash, or dash.",
        },
      },
      400,
    );
  }

  const existing = await findSpriteAssetForAccount(accountId, c.req.param("id"));
  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Sprite asset not found" } },
      404,
    );
  }

  if (nextName && nextName !== existing.name) {
    const [nameConflict] = await db
      .select({ id: spriteAssets.id })
      .from(spriteAssets)
      .where(
        and(
          eq(spriteAssets.accountId, accountId),
          eq(spriteAssets.name, nextName),
          isNull(spriteAssets.deletedAt),
        ),
      )
      .limit(1);
    if (nameConflict && nameConflict.id !== existing.id) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "A sprite asset with that name already exists.",
          },
        },
        409,
      );
    }
  }

  const metadata = mergeSpriteMetadata(existing.metadata, parsed.data.tags);
  const nextDescription =
    parsed.data.description !== undefined
      ? normalizeOptionalString(parsed.data.description, 500)
      : undefined;
  const [updated] = await db
    .update(spriteAssets)
    .set({
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(nextFolder !== undefined ? { folder: nextFolder } : {}),
      ...(parsed.data.description !== undefined
        ? { description: nextDescription }
        : {}),
      ...(parsed.data.tags !== undefined ? { metadata } : {}),
    })
    .where(and(eq(spriteAssets.id, existing.id), eq(spriteAssets.accountId, accountId)))
    .returning();

  await logAudit({
    accountId,
    actorUserId: userId,
    action: "sprite_asset.renamed",
    resourceType: "sprite_asset",
    resourceId: existing.id,
    metadata: {
      previousName: existing.name,
      name: updated!.name,
      folder: updated!.folder,
    },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: serializeSpriteAsset(updated!),
  });
});

stylesRoute.delete("/sprite-assets/:id", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const existing = await findSpriteAssetForAccount(accountId, c.req.param("id"));
  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Sprite asset not found" } },
      404,
    );
  }

  await db
    .update(spriteAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(spriteAssets.id, existing.id), eq(spriteAssets.accountId, accountId)));

  await logAudit({
    accountId,
    actorUserId: userId,
    action: "sprite_asset.deleted",
    resourceType: "sprite_asset",
    resourceId: existing.id,
    metadata: { name: existing.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: { id: existing.id, deleted: true } });
});

// ── POST /console/styles — Create ───────────────────────────────────────────

stylesRoute.post("/styles", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = createStyleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  const { name, description, styleJson, handle } = parsed.data;
  const limits = await getAccountPlanLimits(ownerId);
  let created;
  try {
    created = await createStyleRecord({
      ownerId,
      name,
      handle,
      description,
      styleJson,
      maxStyles: limits.maxStyles,
    });
  } catch (err) {
    return styleCreationErrorResponse(c, err);
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.created",
    resourceType: "style",
    resourceId: created.id,
    metadata: { name, handle: created.handle },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: created }, 201);
});

// ── GET /console/styles — List ──────────────────────────────────────────────

stylesRoute.get("/styles", async (c) => {
  const ownerId = c.get("ownerId");

  const results = await db
    .select({
      id: styles.id,
      handle: styles.handle,
      name: styles.name,
      description: styles.description,
      isPublic: styles.isPublic,
      thumbnailUrl: styles.thumbnailUrl,
      version: styles.version,
      createdAt: styles.createdAt,
      updatedAt: styles.updatedAt,
    })
    .from(styles)
    .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .orderBy(desc(styles.updatedAt));

  return c.json({ data: results });
});

// ── GET /console/styles/:id — Get ──────────────────────────────────────────

stylesRoute.get("/styles/:id", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");

  const [style] = await db
    .select()
    .from(styles)
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (!style) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  const publishedVersion = await resolveLatestPublishedStyleVersion(style.id);

  return c.json({ data: { ...style, publishedVersion } });
});

// ── PUT /console/styles/:id — Update ────────────────────────────────────────

stylesRoute.put("/styles/:id", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = updateStyleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  const { name, description, styleJson, version } = parsed.data;

  // Build SET clause dynamically
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (styleJson !== undefined) updates.styleJson = styleJson;

  if (Object.keys(updates).length === 0) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
      400,
    );
  }

  let result;
  try {
    result = await updateStyleRevision({
      ownerId,
      styleId,
      expectedVersion: version,
      actorUserId: userId,
      updates,
    });
  } catch (err) {
    return styleRevisionErrorResponse(c, err);
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.updated",
    resourceType: "style",
    resourceId: styleId,
    metadata: { version: result.version },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: result });
});

// ── DELETE /console/styles/:id — Soft delete ────────────────────────────────

stylesRoute.delete("/styles/:id", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const deleted = await softDeleteStyleRecord(ownerId, styleId);
  if (!deleted) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.deleted",
    resourceType: "style",
    resourceId: styleId,
    metadata: { name: deleted.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: { id: styleId, deleted: true } });
});

// ── POST /console/styles/:id/publish — Publish immutable snapshot ────────────

stylesRoute.post("/styles/:id/publish", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const rateLimited = await spritePublicationRateLimitResponse(c, ownerId);
  if (rateLimited) return rateLimited;

  const [style] = await db
    .select()
    .from(styles)
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (!style) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  const issues = validateMapLibreStyle(style.styleJson);
  if (issues.length > 0) {
    return c.json(
      {
        error: {
          code: "STYLE_VALIDATION_ERROR",
          message: "Style is not valid MapLibre JSON",
          details: { issues },
        },
      },
      400,
    );
  }

  await db
    .insert(styleVersions)
    .values({
      styleId,
      version: style.version,
      styleJson: style.styleJson,
      name: style.name,
      createdBy: userId,
    })
    .onConflictDoNothing();

  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(
      and(
        eq(styleVersions.styleId, styleId),
        eq(styleVersions.version, style.version),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create style version",
        },
      },
      500,
    );
  }

  let publication: Awaited<ReturnType<typeof publishStyleSnapshot>>;
  try {
    publication = await publishStyleSnapshot({
      styleId,
      ownerId,
      userId,
      snapshot,
    });
  } catch (err) {
    if (err instanceof SpriteAssetValidationError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        400,
      );
    }
    throw err;
  }

  const [updated] = await db
    .update(styles)
    .set({ isPublic: true })
    .where(eq(styles.id, styleId))
    .returning({
      id: styles.id,
      handle: styles.handle,
      name: styles.name,
      isPublic: styles.isPublic,
      version: styles.version,
    });

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.published",
    resourceType: "style",
    resourceId: styleId,
    metadata: { version: snapshot.version, publicationId: publication.id },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: { ...updated!, publishedVersion: snapshot.version, publication },
  });
});

stylesRoute.post("/styles/:id/versions/:versionNum/publish", async (c) => {
  const styleId = c.req.param("id");
  const versionNum = parseInt(c.req.param("versionNum"), 10);
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const rateLimited = await spritePublicationRateLimitResponse(c, ownerId);
  if (rateLimited) return rateLimited;

  if (isNaN(versionNum) || versionNum <= 0) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Invalid version number" },
      },
      400,
    );
  }

  const [style] = await db
    .select({
      id: styles.id,
      handle: styles.handle,
      name: styles.name,
      ownerId: styles.ownerId,
      version: styles.version,
    })
    .from(styles)
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (!style) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(
      and(
        eq(styleVersions.styleId, styleId),
        eq(styleVersions.version, versionNum),
      ),
    )
    .limit(1);

  if (!snapshot) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Version not found" } },
      404,
    );
  }

  const issues = validateMapLibreStyle(snapshot.styleJson);
  if (issues.length > 0) {
    return c.json(
      {
        error: {
          code: "STYLE_VALIDATION_ERROR",
          message: "Style version is not valid MapLibre JSON",
          details: { issues },
        },
      },
      400,
    );
  }

  let publication: Awaited<ReturnType<typeof publishStyleSnapshot>>;
  try {
    publication = await publishStyleSnapshot({
      styleId,
      ownerId,
      userId,
      snapshot,
    });
  } catch (err) {
    if (err instanceof SpriteAssetValidationError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        400,
      );
    }
    throw err;
  }

  const [updated] = await db
    .update(styles)
    .set({ isPublic: true })
    .where(eq(styles.id, styleId))
    .returning({
      id: styles.id,
      handle: styles.handle,
      name: styles.name,
      isPublic: styles.isPublic,
      version: styles.version,
    });

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.published_version",
    resourceType: "style",
    resourceId: styleId,
    metadata: { version: snapshot.version, publicationId: publication.id },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: { ...updated!, publishedVersion: snapshot.version, publication },
  });
});

stylesRoute.post("/styles/:id/unpublish", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const [updated] = await db
    .update(styles)
    .set({ isPublic: false })
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        isNull(styles.deletedAt),
      ),
    )
    .returning({ id: styles.id, isPublic: styles.isPublic });

  if (!updated) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.unpublished",
    resourceType: "style",
    resourceId: styleId,
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: { ...updated, handle: styleId, name: "", version: 0 },
  });
});

// ── POST /console/styles/:id/duplicate — Duplicate ─────────────────────────

stylesRoute.post("/styles/:id/duplicate", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const limits = await getAccountPlanLimits(ownerId);
  let created;
  try {
    created = await duplicateStyleRecord({
      ownerId,
      styleId,
      maxStyles: limits.maxStyles,
    });
  } catch (err) {
    return styleCreationErrorResponse(c, err);
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.created",
    resourceType: "style",
    resourceId: created.id,
    metadata: { name: created.name, duplicatedFrom: styleId },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: created }, 201);
});

// ── GET /console/styles/:id/versions — Version history ────────────────────

stylesRoute.get("/styles/:id/versions", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");

  // Verify ownership
  const [style] = await db
    .select({ id: styles.id })
    .from(styles)
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (!style) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  const versions = await db
    .select({
      id: styleVersions.id,
      version: styleVersions.version,
      name: styleVersions.name,
      createdBy: styleVersions.createdBy,
      createdAt: styleVersions.createdAt,
    })
    .from(styleVersions)
    .where(eq(styleVersions.styleId, styleId))
    .orderBy(desc(styleVersions.version));

  return c.json({ data: versions });
});

// ── POST /console/styles/:id/versions/:versionNum/restore — Restore ──────

stylesRoute.post("/styles/:id/versions/:versionNum/restore", async (c) => {
  const styleId = c.req.param("id");
  const versionNum = parseInt(c.req.param("versionNum"), 10);
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsedBody = restoreStyleSchema.safeParse(body);

  if (isNaN(versionNum) || !parsedBody.success) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Invalid version number" },
      },
      400,
    );
  }

  let updated;
  try {
    updated = await restoreStyleRevision({
      ownerId,
      styleId,
      expectedVersion: parsedBody.data.expectedVersion,
      targetVersion: versionNum,
      actorUserId: userId,
    });
  } catch (err) {
    return styleRevisionErrorResponse(c, err);
  }

  await logAudit({
    accountId: ownerId,
    actorUserId: userId,
    action: "style.restored",
    resourceType: "style",
    resourceId: styleId,
    metadata: { restoredVersion: versionNum, newVersion: updated.version },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: updated });
});

function styleRevisionErrorResponse(
  c: Context<AuthEnv>,
  err: unknown,
) {
  if (!(err instanceof StyleRevisionError)) throw err;
  if (err.code === "VERSION_CONFLICT") {
    return c.json(
      {
        error: {
          code: "VERSION_CONFLICT",
          message: err.message,
          details: { currentVersion: err.currentVersion },
        },
      },
      409,
    );
  }
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message:
          err.code === "VERSION_NOT_FOUND" ? "Version not found" : "Style not found",
      },
    },
    404,
  );
}

function styleCreationErrorResponse(c: Context<AuthEnv>, err: unknown) {
  if (!(err instanceof StyleCreationError)) throw err;
  if (err.code === "STYLE_NOT_FOUND") {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }
  if (err.code === "PLAN_LIMIT") {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${err.limit} styles on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }
  return c.json(
    {
      error: {
        code: err.code === "INVALID_HANDLE" ? "VALIDATION_ERROR" : "CONFLICT",
        message: err.message,
      },
    },
    err.code === "INVALID_HANDLE" ? 400 : 409,
  );
}

async function publishStyleSnapshot({
  styleId,
  ownerId,
  userId,
  snapshot,
}: {
  styleId: string;
  ownerId: string;
  userId: string;
  snapshot: typeof styleVersions.$inferSelect;
}) {
  const [existingImmutable] = await db
    .select()
    .from(stylePublications)
    .where(
      and(
        eq(stylePublications.styleId, styleId),
        eq(stylePublications.alias, `v${snapshot.version}`),
      ),
    )
    .limit(1);
  if (existingImmutable) {
    const [latest] = await db
      .insert(stylePublications)
      .values({
        styleId,
        styleVersionId: existingImmutable.styleVersionId,
        accountId: ownerId,
        alias: "latest",
        publishedBy: userId,
        metadata: existingImmutable.metadata,
      })
      .onConflictDoUpdate({
        target: [stylePublications.styleId, stylePublications.alias],
        set: {
          styleVersionId: existingImmutable.styleVersionId,
          accountId: ownerId,
          publishedBy: userId,
          metadata: existingImmutable.metadata,
        },
      })
      .returning();
    if (!latest) throw new Error("Failed to republish immutable style snapshot");
    return latest;
  }

  const sprite = await createStyleSpriteAssets({
    ownerId,
    styleId,
    snapshot,
  });
  const metadata = {
    version: snapshot.version,
    ...(sprite ? { sprite } : {}),
  };

  let publication;
  try {
    publication = await db.transaction(async (tx) => {
    const [latest] = await tx
      .insert(stylePublications)
      .values({
        styleId,
        styleVersionId: snapshot.id,
        accountId: ownerId,
        alias: "latest",
        publishedBy: userId,
        metadata,
      })
      .onConflictDoUpdate({
        target: [stylePublications.styleId, stylePublications.alias],
        set: {
          styleVersionId: snapshot.id,
          accountId: ownerId,
          publishedBy: userId,
          metadata,
        },
      })
      .returning();

    await tx
      .insert(stylePublications)
      .values({
        styleId,
        styleVersionId: snapshot.id,
        accountId: ownerId,
        alias: `v${snapshot.version}`,
        publishedBy: userId,
        metadata,
      })
      .onConflictDoNothing();

      return latest;
    });
  } catch (err) {
    if (sprite) await cleanupPublishedSprite(sprite);
    throw err;
  }

  if (!publication) {
    throw new Error("Failed to publish style snapshot");
  }

  return publication;
}

async function createStyleSpriteAssets({
  ownerId,
  styleId,
  snapshot,
}: {
  ownerId: string;
  styleId: string;
  snapshot: typeof styleVersions.$inferSelect;
}): Promise<PublishedSpriteMetadata | null> {
  if (!styleReferencesSpriteAssets(snapshot.styleJson)) return null;

  const imageIds = extractSpriteImageIds(snapshot.styleJson);
  if (imageIds.length === 0) return null;
  if (imageIds.length > SPRITE_ATLAS_MAX_ASSETS) {
    throw new SpriteAssetValidationError(
      "SPRITE_ATLAS_LIMIT",
      `A style can reference at most ${SPRITE_ATLAS_MAX_ASSETS} sprite assets.`,
    );
  }

  const rows = await db
    .select({
      id: spriteAssets.id,
      name: spriteAssets.name,
      storageObjectId: spriteAssets.storageObjectId,
      rasterStorageObjectId: spriteAssets.rasterStorageObjectId,
      storageKey: storageObjects.storageKey,
    })
    .from(spriteAssets)
    .innerJoin(storageObjects, eq(spriteAssets.storageObjectId, storageObjects.id))
    .where(
      and(
        eq(spriteAssets.accountId, ownerId),
        inArray(spriteAssets.name, imageIds),
        isNull(spriteAssets.deletedAt),
        isNull(storageObjects.deletedAt),
      ),
    );
  const byName = new Map(rows.map((row) => [row.name, row]));
  const missing = imageIds.filter((id) => !byName.has(id));
  if (missing.length > 0) {
    throw new SpriteAssetValidationError(
      "MISSING_SPRITE_ASSETS",
      `Style references missing sprite assets: ${missing.join(", ")}.`,
    );
  }

  const spriteId = `${spriteIdForStyleVersion(
    styleId,
    snapshot.version,
    imageIds,
  )}-${Date.now()}`;
  const keys = spriteStorageKeys(spriteId);
  const storage = getStorage();
  const info = storage.getInfo();
  const assetImages = await mapWithConcurrency(
    imageIds,
    4,
    async (name) => {
      const row = byName.get(name)!;
      const data = await storage.download(await resolveSpriteRasterStorageKey(row));
      const validated = validateSpritePngUpload({
        buffer: data,
        contentType: "image/png",
        size: data.byteLength,
        maxBytes: SPRITE_NORMALIZED_MAX_BYTES,
      });
      return { id: row.id, name, png: validated.png };
    },
  );
  const sheet = buildSpriteSheet(assetImages, 1);
  const sheet2x = buildSpriteSheet(assetImages, 2);
  const json = Buffer.from(JSON.stringify(sheet.json));
  const json2x = Buffer.from(JSON.stringify(sheet2x.json));
  if (
    json.byteLength > SPRITE_ATLAS_MAX_JSON_BYTES ||
    json2x.byteLength > SPRITE_ATLAS_MAX_JSON_BYTES
  ) {
    throw new SpriteAssetValidationError(
      "SPRITE_ATLAS_LIMIT",
      `Sprite manifests cannot exceed ${SPRITE_ATLAS_MAX_JSON_BYTES} bytes.`,
    );
  }

  const uploadInputs = [
    [keys.json, json, "application/json"],
    [keys.png, sheet.png, "image/png"],
    [keys.json2x, json2x, "application/json"],
    [keys.png2x, sheet2x.png, "image/png"],
  ] as const;
  let uploads;
  try {
    uploads = await Promise.all(
      uploadInputs.map(([key, data, contentType]) =>
        storage.upload(key, data, contentType),
      ),
    );
  } catch (err) {
    await Promise.all(
      uploadInputs.map(([key]) => storage.delete(key).catch(() => undefined)),
    );
    throw err;
  }

  let objects;
  try {
    objects = await db.transaction((tx) =>
      Promise.all([
        recordStorageObject({
      accountId: ownerId,
      provider: info.provider,
      bucket: info.bucket,
      storageKey: keys.json,
      fileName: "sprite.json",
      contentType: "application/json",
      size: uploads[0]!.size,
      resourceType: "style",
      resourceId: styleId,
      artifactKind: "sprite-json",
      version: String(snapshot.version),
      metadata: { spriteId, scale: 1, imageIds },
        }, tx),
        recordStorageObject({
      accountId: ownerId,
      provider: info.provider,
      bucket: info.bucket,
      storageKey: keys.png,
      fileName: "sprite.png",
      contentType: "image/png",
      size: uploads[1]!.size,
      resourceType: "style",
      resourceId: styleId,
      artifactKind: "sprite-png",
      version: String(snapshot.version),
      metadata: { spriteId, scale: 1, imageIds },
        }, tx),
        recordStorageObject({
      accountId: ownerId,
      provider: info.provider,
      bucket: info.bucket,
      storageKey: keys.json2x,
      fileName: "sprite@2x.json",
      contentType: "application/json",
      size: uploads[2]!.size,
      resourceType: "style",
      resourceId: styleId,
      artifactKind: "sprite-json-2x",
      version: String(snapshot.version),
      metadata: { spriteId, scale: 2, imageIds },
        }, tx),
        recordStorageObject({
      accountId: ownerId,
      provider: info.provider,
      bucket: info.bucket,
      storageKey: keys.png2x,
      fileName: "sprite@2x.png",
      contentType: "image/png",
      size: uploads[3]!.size,
      resourceType: "style",
      resourceId: styleId,
      artifactKind: "sprite-png-2x",
      version: String(snapshot.version),
      metadata: { spriteId, scale: 2, imageIds },
        }, tx),
      ]),
    );
  } catch (err) {
    await Promise.all(
      uploadInputs.map(([key]) => storage.delete(key).catch(() => undefined)),
    );
    throw err;
  }

  return {
    id: spriteId,
    imageIds,
    storageObjects: {
      json: objects[0]!.id,
      png: objects[1]!.id,
      json2x: objects[2]!.id,
      png2x: objects[3]!.id,
    },
    storageKeys: keys,
  };
}

async function cleanupPublishedSprite(sprite: PublishedSpriteMetadata) {
  const storage = getStorage();
  await Promise.all(
    Object.values(sprite.storageKeys).map((key) =>
      storage.delete(key).catch(() => undefined),
    ),
  );
  await db
    .update(storageObjects)
    .set({ deletedAt: new Date() })
    .where(inArray(storageObjects.id, Object.values(sprite.storageObjects)));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await mapper(values[index]!);
      }
    }),
  );
  return results;
}

async function spritePublicationRateLimitResponse(
  c: Context<AuthEnv>,
  ownerId: string,
) {
  const retryAfter = await consumeSpritePublicationRateLimit(ownerId);
  if (retryAfter === null) return null;
  c.header("Retry-After", String(retryAfter));
  return c.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many style publications. Please try again later.",
      },
    },
    429,
  );
}

function normalizeSpriteFolder(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().replace(/^\/+|\/+$/g, "");
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function parseSpriteTags(value: unknown) {
  const raw =
    typeof value === "string"
      ? value.trim().startsWith("[")
        ? parseJsonStringArray(value)
        : value.split(",")
      : Array.isArray(value)
        ? value
        : [];
  return [...new Set(raw.map((tag) => String(tag).trim()).filter(Boolean))]
    .filter((tag) => tag.length <= 48)
    .slice(0, 20);
}

function parseJsonStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeSpriteMetadata(current: unknown, tags?: string[]) {
  const base = isJsonObject(current) ? { ...current } : {};
  if (tags !== undefined) {
    base.tags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
      .filter((tag) => tag.length <= 48)
      .slice(0, 20);
  }
  return base;
}

function serializeSpriteAsset(asset: {
  id: string;
  name: string;
  folder?: string | null;
  description?: string | null;
  sourceFormat?: string | null;
  width: number;
  height: number;
  metadata?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  size?: number | null;
}) {
  const metadata = isJsonObject(asset.metadata) ? asset.metadata : {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    id: asset.id,
    name: asset.name,
    folder: asset.folder ?? "",
    description: asset.description ?? null,
    sourceFormat: asset.sourceFormat ?? "png",
    width: asset.width,
    height: asset.height,
    size: asset.size ?? null,
    tags,
    previewUrl: `/console/sprite-assets/${asset.id}/image`,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

async function resolveSpriteRasterStorageKey(asset: {
  id: string;
  storageObjectId: string;
  rasterStorageObjectId?: string | null;
  storageKey: string;
}) {
  const rasterStorageObjectId =
    asset.rasterStorageObjectId ?? asset.storageObjectId;
  if (rasterStorageObjectId === asset.storageObjectId) return asset.storageKey;

  const [object] = await db
    .select({ storageKey: storageObjects.storageKey })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, rasterStorageObjectId),
        isNull(storageObjects.deletedAt),
      ),
    )
    .limit(1);
  if (!object) {
    throw new SpriteAssetValidationError(
      "MISSING_SPRITE_RASTER",
      `Sprite asset ${asset.id} is missing its rasterized PNG copy.`,
    );
  }
  return object.storageKey;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findSpriteAssetForAccount(accountId: string, assetId: string) {
  const [asset] = await db
    .select({
      id: spriteAssets.id,
      accountId: spriteAssets.accountId,
      name: spriteAssets.name,
      folder: spriteAssets.folder,
      description: spriteAssets.description,
      sourceFormat: spriteAssets.sourceFormat,
      width: spriteAssets.width,
      height: spriteAssets.height,
      metadata: spriteAssets.metadata,
      createdAt: spriteAssets.createdAt,
      updatedAt: spriteAssets.updatedAt,
      storageObjectId: spriteAssets.storageObjectId,
      rasterStorageObjectId: spriteAssets.rasterStorageObjectId,
      storageKey: storageObjects.storageKey,
      size: storageObjects.size,
    })
    .from(spriteAssets)
    .innerJoin(storageObjects, eq(spriteAssets.storageObjectId, storageObjects.id))
    .where(
      and(
        eq(spriteAssets.id, assetId),
        eq(spriteAssets.accountId, accountId),
        isNull(spriteAssets.deletedAt),
        isNull(storageObjects.deletedAt),
      ),
    )
    .limit(1);

  return asset ?? null;
}

async function resolveLatestPublishedStyleVersion(styleId: string) {
  const [publication] = await db
    .select({ styleVersionId: stylePublications.styleVersionId })
    .from(stylePublications)
    .where(
      and(
        eq(stylePublications.styleId, styleId),
        eq(stylePublications.alias, "latest"),
      ),
    )
    .limit(1);

  if (!publication) return null;

  const [snapshot] = await db
    .select({ version: styleVersions.version })
    .from(styleVersions)
    .where(eq(styleVersions.id, publication.styleVersionId))
    .limit(1);

  return snapshot?.version ?? null;
}
