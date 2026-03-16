import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { db, styles, styleVersions } from "@planisfy/database";
import { logAudit } from "../lib/audit";
import { checkResourceLimit } from "../lib/plan-check";
import type { AuthEnv } from "../middleware/auth";

export const stylesRoute = new Hono<AuthEnv>();

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function uniqueHandle(ownerId: string, base: string): Promise<string> {
  let handle = base || "untitled";
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? handle : `${handle}-${attempt}`;
    const [existing] = await db
      .select({ id: styles.id })
      .from(styles)
      .where(
        and(
          eq(styles.ownerId, ownerId),
          eq(styles.handle, candidate),
          isNull(styles.deletedAt)
        )
      )
      .limit(1);
    if (!existing) return candidate;
    attempt++;
    if (attempt > 100) return `${handle}-${Date.now()}`;
  }
}

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
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      400
    );
  }

  const planCheck = await checkResourceLimit(userId, ownerId, "styles");
  if (!planCheck.allowed) {
    return c.json({
      error: {
        code: "PLAN_LIMIT",
        message: `You've reached the maximum of ${planCheck.limit} styles on your current plan. Please upgrade to create more.`,
      },
    }, 403);
  }

  const { name, description, styleJson } = parsed.data;
  const handle = await uniqueHandle(ownerId, parsed.data.handle ?? slugify(name));

  const [created] = await db
    .insert(styles)
    .values({
      ownerId,
      handle,
      name,
      description: description ?? null,
      styleJson,
      originalStyleJson: styleJson,
      version: 1,
    })
    .returning();

  logAudit({
    profileId: userId,
    action: "style.created",
    resourceType: "style",
    resourceId: created!.id,
    metadata: { name, handle },
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
    .where(and(eq(styles.id, styleId), isNull(styles.deletedAt)))
    .limit(1);

  if (!style) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  // Allow access to own styles or public styles
  if (style.ownerId !== ownerId && !style.isPublic) {
    return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
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
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      400
    );
  }

  const { name, description, styleJson, version } = parsed.data;

  // Build SET clause dynamically
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (styleJson !== undefined) updates.styleJson = styleJson;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
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
        isNull(styles.deletedAt)
      )
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
        isNull(styles.deletedAt)
      )
    )
    .returning({
      id: styles.id,
      version: styles.version,
      updatedAt: styles.updatedAt,
    });

  if (result.length === 0) {
    // Determine reason: not found, not owned, or version conflict
    const [existing] = await db
      .select({ id: styles.id, ownerId: styles.ownerId, version: styles.version })
      .from(styles)
      .where(and(eq(styles.id, styleId), isNull(styles.deletedAt)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
    }
    if (existing.ownerId !== ownerId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
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
      409
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

  const result = await db
    .update(styles)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )
    .returning({ id: styles.id, name: styles.name });

  if (result.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  logAudit({
    profileId: userId,
    action: "style.deleted",
    resourceType: "style",
    resourceId: styleId,
    metadata: { name: result[0]!.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: { id: styleId, deleted: true } });
});

// ── POST /console/styles/:id/publish — Toggle public ───────────────────────

stylesRoute.post("/styles/:id/publish", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const result = await db
    .update(styles)
    .set({ isPublic: sql`NOT ${styles.isPublic}` })
    .where(
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )
    .returning({ id: styles.id, isPublic: styles.isPublic });

  if (result.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  logAudit({
    profileId: userId,
    action: result[0]!.isPublic ? "style.published" : "style.unpublished",
    resourceType: "style",
    resourceId: styleId,
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: result[0] });
});

// ── POST /console/styles/:id/duplicate — Duplicate ─────────────────────────

stylesRoute.post("/styles/:id/duplicate", async (c) => {
  const styleId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const [original] = await db
    .select()
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .limit(1);

  if (!original) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  const handle = await uniqueHandle(ownerId, `${original.handle}-copy`);

  const [created] = await db
    .insert(styles)
    .values({
      ownerId,
      handle,
      name: `${original.name} (copy)`,
      description: original.description,
      styleJson: original.styleJson,
      originalStyleJson: original.styleJson,
      version: 1,
    })
    .returning();

  logAudit({
    profileId: userId,
    action: "style.created",
    resourceType: "style",
    resourceId: created!.id,
    metadata: { name: created!.name, duplicatedFrom: styleId },
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
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )
    .limit(1);

  if (!style) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
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
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid version number" } }, 400);
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
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )
    .limit(1);

  if (!current) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  // Get the version to restore
  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(
      and(
        eq(styleVersions.styleId, styleId),
        eq(styleVersions.version, versionNum)
      )
    )
    .limit(1);

  if (!snapshot) {
    return c.json({ error: { code: "NOT_FOUND", message: "Version not found" } }, 404);
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
