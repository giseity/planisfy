import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { apiKeys, db, profiles, sessions, users } from "@planisfy/database";
import {
  deleteConsoleProfileSchema,
  updateConsoleProfileSchema,
} from "@planisfy/api-contracts";
import { logAudit } from "../../shared/audit";
import { jsonValidator } from "../../shared/validation/validation";
import type { AuthEnv } from "../../middleware/auth";

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

const profileBaseRoute = new Hono<AuthEnv>();

// ── GET /console/profile - Get current user profile ─────────────────────────

export const profileRoute = profileBaseRoute.get("/profile", async (c) => {
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
})
// ── PUT /console/profile - Update profile ───────────────────────────────────
.put(
  "/profile",
  jsonValidator(updateConsoleProfileSchema),
  async (c) => {
  const userId = c.get("userId");
  const { displayName, handle, bio } = c.req.valid("json");

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
  },
)
// ── DELETE /console/profile - Delete account ────────────────────────────────
.delete(
  "/profile",
  jsonValidator(deleteConsoleProfileSchema),
  async (c) => {
  const userId = c.get("userId");
  const { confirmation } = c.req.valid("json");

  // Get user email to verify confirmation
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }

  if (confirmation !== user.email) {
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
      .set({ enabled: false, updatedAt: now })
      .where(and(eq(apiKeys.referenceId, userId), eq(apiKeys.enabled, true)));
  });

  return c.json({ data: { deleted: true } });
  },
);
