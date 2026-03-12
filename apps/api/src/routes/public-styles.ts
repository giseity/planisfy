import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { db, styles, profiles } from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";

export const publicStylesRoute = new Hono<AuthEnv>();

// ── GET /styles/v1/:owner/:handle — Serve style JSON (public API) ───────────

publicStylesRoute.get("/styles/v1/:owner/:handle", async (c) => {
  const { owner, handle } = c.req.param();

  // Resolve owner by handle
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.handle, owner), isNull(profiles.deletedAt)))
    .limit(1);

  if (!profile) {
    return c.json({ error: { code: "NOT_FOUND", message: "Owner not found" } }, 404);
  }

  const [style] = await db
    .select({
      id: styles.id,
      name: styles.name,
      handle: styles.handle,
      styleJson: styles.styleJson,
      isPublic: styles.isPublic,
      ownerId: styles.ownerId,
      version: styles.version,
      updatedAt: styles.updatedAt,
    })
    .from(styles)
    .where(
      and(
        eq(styles.ownerId, profile.id),
        eq(styles.handle, handle),
        isNull(styles.deletedAt)
      )
    )
    .limit(1);

  if (!style) {
    return c.json({ error: { code: "NOT_FOUND", message: "Style not found" } }, 404);
  }

  // Access control: public styles are open, private requires ownership
  const requestOwnerId = c.get("ownerId");
  if (!style.isPublic && style.ownerId !== requestOwnerId) {
    return c.json({ error: { code: "FORBIDDEN", message: "Style is private" } }, 403);
  }

  c.header("Cache-Control", style.isPublic ? "public, max-age=300" : "private, no-cache");
  c.header("ETag", `"v${style.version}"`);

  return c.json(style.styleJson);
});

// ── GET /styles/v1/:owner/:handle/sprite* — Proxy sprite resources ──────────
// TODO: When sprite storage is implemented (Phase 7), proxy from R2/S3
// For now, return 404 — sprites are loaded directly by the map client

publicStylesRoute.get("/styles/v1/:owner/:handle/sprite*", async (c) => {
  return c.json({ error: { code: "NOT_FOUND", message: "Sprite not configured" } }, 404);
});
