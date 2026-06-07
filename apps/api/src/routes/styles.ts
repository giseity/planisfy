import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  db,
  styles,
  stylePublications,
  styleVersions,
} from "@planisfy/database";
import { validateMapLibreStyle } from "@planisfy/style-spec";
import {
  createStyleRecord,
  duplicateStyleRecord,
  softDeleteStyleRecord,
} from "@planisfy/database/style-service";
import { logAudit } from "../lib/audit";
import { checkResourceLimit } from "../lib/plan-check";
import type { AuthEnv } from "../middleware/auth";

export const stylesRoute = new Hono<AuthEnv>();

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

  const planCheck = await checkResourceLimit(userId, ownerId, "styles");
  if (!planCheck.allowed) {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${planCheck.limit} styles on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }

  const { name, description, styleJson, handle } = parsed.data;
  const created = await createStyleRecord({
    ownerId,
    name,
    handle,
    description,
    styleJson,
  });

  logAudit({
    profileId: userId,
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

  return c.json({ data: style });
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

  // Save a version snapshot of the current state before updating
  const [current] = await db
    .select({
      version: styles.version,
      styleJson: styles.styleJson,
      name: styles.name,
    })
    .from(styles)
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        eq(styles.version, version),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (current) {
    await db
      .insert(styleVersions)
      .values({
        styleId,
        version: current.version,
        styleJson: current.styleJson,
        name: current.name,
        createdBy: userId,
      })
      .onConflictDoNothing();
  }

  // Optimistic locking: only update if version matches
  const result = await db
    .update(styles)
    .set({
      ...updates,
      version: sql`${styles.version} + 1`,
    })
    .where(
      and(
        eq(styles.id, styleId),
        eq(styles.ownerId, ownerId),
        eq(styles.version, version),
        isNull(styles.deletedAt),
      ),
    )
    .returning({
      id: styles.id,
      version: styles.version,
      updatedAt: styles.updatedAt,
    });

  if (result.length === 0) {
    // Determine reason: not found, not owned, or version conflict
    const [existing] = await db
      .select({
        id: styles.id,
        ownerId: styles.ownerId,
        version: styles.version,
      })
      .from(styles)
      .where(and(eq(styles.id, styleId), isNull(styles.deletedAt)))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Style not found" } },
        404,
      );
    }
    if (existing.ownerId !== ownerId) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Access denied" } },
        403,
      );
    }
    // Version mismatch
    return c.json(
      {
        error: {
          code: "VERSION_CONFLICT",
          message: "Style was modified by another session",
          details: { currentVersion: existing.version },
        },
      },
      409,
    );
  }

  logAudit({
    profileId: userId,
    action: "style.updated",
    resourceType: "style",
    resourceId: styleId,
    metadata: { version: result[0]!.version },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: result[0] });
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

  logAudit({
    profileId: userId,
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

  const publication = await publishStyleSnapshot({
    styleId,
    ownerId,
    userId,
    snapshot,
  });

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

  logAudit({
    profileId: userId,
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

  const publication = await publishStyleSnapshot({
    styleId,
    ownerId,
    userId,
    snapshot,
  });

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

  logAudit({
    profileId: userId,
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

  logAudit({
    profileId: userId,
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

  const created = await duplicateStyleRecord(ownerId, styleId);
  if (!created) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  logAudit({
    profileId: userId,
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

  if (isNaN(versionNum)) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Invalid version number" },
      },
      400,
    );
  }

  // Get current style to check ownership and get current version
  const [current] = await db
    .select({
      id: styles.id,
      version: styles.version,
      styleJson: styles.styleJson,
      name: styles.name,
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

  if (!current) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  // Get the version to restore
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

  // Save the current state as a version before restoring
  await db
    .insert(styleVersions)
    .values({
      styleId,
      version: current.version,
      styleJson: current.styleJson,
      name: current.name,
      createdBy: userId,
    })
    .onConflictDoNothing();

  // Restore: update the style with the snapshot's data
  const [updated] = await db
    .update(styles)
    .set({
      styleJson: snapshot.styleJson,
      name: snapshot.name,
      version: sql`${styles.version} + 1`,
    })
    .where(eq(styles.id, styleId))
    .returning({
      id: styles.id,
      version: styles.version,
      updatedAt: styles.updatedAt,
    });

  logAudit({
    profileId: userId,
    action: "style.restored",
    resourceType: "style",
    resourceId: styleId,
    metadata: { restoredVersion: versionNum, newVersion: updated!.version },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: updated });
});

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
  await db
    .delete(stylePublications)
    .where(
      and(
        eq(stylePublications.styleId, styleId),
        eq(stylePublications.alias, "latest"),
      ),
    );

  const [publication] = await db
    .insert(stylePublications)
    .values({
      styleId,
      styleVersionId: snapshot.id,
      accountId: ownerId,
      alias: "latest",
      publishedBy: userId,
      metadata: { version: snapshot.version },
    })
    .returning();

  await db
    .insert(stylePublications)
    .values({
      styleId,
      styleVersionId: snapshot.id,
      accountId: ownerId,
      alias: `v${snapshot.version}`,
      publishedBy: userId,
      metadata: { version: snapshot.version },
    })
    .onConflictDoNothing();

  if (!publication) {
    throw new Error("Failed to publish style snapshot");
  }

  return publication;
}
