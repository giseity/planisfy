import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { apiKeys, db, profiles, sessions, users } from "@planisfy/database";
import { logAudit } from "../lib/audit";
import type { AuthEnv } from "../middleware/auth";

export const profileRoute = new Hono<AuthEnv>();

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

// ── GET /console/profile — Get current user profile ─────────────────────────

profileRoute.get("/profile", async (c) => {
  const userId = c.get("userId");

  const [profile] = await db
    .select({
      id: profiles.id,
      handle: profiles.handle,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      bio: profiles.bio,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.id, users.id))
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) {
    return c.json({ error: { code: "NOT_FOUND", message: "Profile not found" } }, 404);
  }

  return c.json({ data: profile });
});

// ── PUT /console/profile — Update profile ───────────────────────────────────

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  handle: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/, "Handle must be lowercase alphanumeric with hyphens or underscores")
    .optional(),
  bio: z.string().max(500).optional(),
});

profileRoute.put("/profile", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      400
    );
  }

  const { displayName, handle, bio } = parsed.data;

  if (!displayName && !handle && bio === undefined) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
  }

  // Check handle uniqueness if changing
  if (handle) {
    const [existing] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.handle, handle),
          isNull(profiles.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== userId) {
      return c.json(
        { error: { code: "CONFLICT", message: "Handle is already taken" } },
        409
      );
    }
  }

  // Update profile
  const profileUpdates: Record<string, unknown> = {};
  if (displayName !== undefined) profileUpdates.displayName = displayName;
  if (handle !== undefined) profileUpdates.handle = handle;
  if (bio !== undefined) profileUpdates.bio = bio;

  const [updated] = await db
    .update(profiles)
    .set(profileUpdates)
    .where(eq(profiles.id, userId))
    .returning({
      id: profiles.id,
      handle: profiles.handle,
      displayName: profiles.displayName,
      bio: profiles.bio,
      avatarUrl: profiles.avatarUrl,
    });

  // Sync displayName → users.name
  if (displayName !== undefined) {
    await db.update(users).set({ name: displayName }).where(eq(users.id, userId));
  }

  logAudit({
    profileId: userId,
    action: "profile.updated",
    resourceType: "profile",
    resourceId: userId,
    metadata: { fields: Object.keys(profileUpdates) },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: updated });
});

// ── DELETE /console/profile — Delete account ────────────────────────────────

const deleteAccountSchema = z.object({
  confirmation: z.string(),
});

profileRoute.delete("/profile", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input" } },
      400
    );
  }

  // Get user email to verify confirmation
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }

  if (parsed.data.confirmation !== user.email) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Email confirmation does not match" } },
      400
    );
  }

  logAudit({
    profileId: userId,
    action: "account.deleted",
    resourceType: "profile",
    resourceId: userId,
    ipAddress: getClientIp(c.req.raw),
  });

  // Soft-delete the account and immediately revoke credentials that would
  // otherwise remain valid until their normal expiry.
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(profiles.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(apiKeys)
      .set({ deletedAt: now })
      .where(and(eq(apiKeys.ownerId, userId), isNull(apiKeys.deletedAt)));
  });

  return c.json({ data: { deleted: true } });
});
