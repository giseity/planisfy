import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  apiKeys,
  db,
  profiles,
  sessions,
  storageObjects,
  users,
} from "@planisfy/database";
import {
  deleteConsoleProfileSchema,
  updateConsoleProfileSchema,
} from "@planisfy/api-contracts";
import { getStorage } from "@planisfy/storage";
import { StoragePaths } from "@planisfy/storage-paths";
import sharp from "sharp";
import { logAudit } from "../../shared/audit";
import { jsonValidator } from "../../shared/validation/validation";
import type { AuthEnv } from "../../middleware/auth";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE = 256;
const AVATAR_RESOURCE_TYPE = "profile_avatar";
const AVATAR_URL_BASE = "/console/profile/avatar";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

const profileBaseRoute = new Hono<AuthEnv>();

// ── GET /console/profile - Get current user profile ─────────────────────────

export const profileRoute = profileBaseRoute
  .get("/profile", async (c) => {
    const userId = c.get("userId");

    const profile = await getProfile(userId);
    if (!profile) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Profile not found" } },
        404,
      );
    }

    return c.json({ data: profile });
  })
  // ── GET /console/profile/avatar - Serve current profile avatar ──────────────
  .get("/profile/avatar", async (c) => {
    const userId = c.get("userId");
    const objectId = c.req.query("object");

    if (objectId && !UUID_RE.test(objectId)) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid avatar object" },
        },
        400,
      );
    }

    const [object] = await db
      .select({
        id: storageObjects.id,
        storageKey: storageObjects.storageKey,
        contentType: storageObjects.contentType,
      })
      .from(storageObjects)
      .where(
        and(
          objectId
            ? eq(storageObjects.id, objectId)
            : eq(storageObjects.accountId, userId),
          eq(storageObjects.accountId, userId),
          eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
          eq(storageObjects.resourceId, userId),
          isNull(storageObjects.deletedAt),
        ),
      )
      .orderBy(desc(storageObjects.createdAt))
      .limit(1);

    if (!object) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Avatar not found" } },
        404,
      );
    }

    const data = await getStorage().download(object.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": object.contentType ?? "image/webp",
        "Cache-Control": "private, max-age=300",
      },
    });
  })
  // ── POST /console/profile/avatar - Upload profile avatar ───────────────────
  .post("/profile/avatar", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "PNG, JPEG, or WebP image is required",
          },
        },
        400,
      );
    }

    if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: "AVATAR_TOO_LARGE",
            message: `Avatar image must be between 1 byte and ${AVATAR_MAX_BYTES / 1024 / 1024}MB.`,
          },
        },
        400,
      );
    }

    const source = Buffer.from(await file.arrayBuffer());
    let avatar: NormalizedAvatarUpload;
    try {
      avatar = await normalizeAvatarUpload({
        buffer: source,
        contentType: file.type || null,
        fileName: file.name,
        size: file.size,
      });
    } catch (err) {
      if (err instanceof AvatarValidationError) {
        return c.json({ error: { code: err.code, message: err.message } }, 400);
      }
      throw err;
    }

    const avatarId = randomUUID();
    const fileName = "avatar.webp";
    const storage = getStorage();
    const storageInfo = storage.getInfo();
    const storageKey = StoragePaths.profileAvatar(userId, avatarId, fileName);
    const stored = await storage.upload(
      storageKey,
      avatar.buffer,
      avatar.contentType,
    );

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      await tx
        .update(storageObjects)
        .set({ deletedAt: now })
        .where(
          and(
            eq(storageObjects.accountId, userId),
            eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
            eq(storageObjects.resourceId, userId),
            isNull(storageObjects.deletedAt),
          ),
        );

      const [object] = await tx
        .insert(storageObjects)
        .values({
          accountId: userId,
          provider: storageInfo.provider,
          bucket: storageInfo.bucket,
          storageKey,
          fileName,
          contentType: stored.contentType,
          size: stored.size,
          resourceType: AVATAR_RESOURCE_TYPE,
          resourceId: userId,
          artifactKind: "avatar",
          metadata: {
            width: avatar.width,
            height: avatar.height,
            sourceContentType: avatar.sourceContentType,
          },
        })
        .returning();

      const avatarUrl = `${AVATAR_URL_BASE}?object=${object!.id}`;
      await tx
        .update(profiles)
        .set({ avatarUrl })
        .where(eq(profiles.id, userId));
      await tx
        .update(users)
        .set({ image: avatarUrl })
        .where(eq(users.id, userId));

      return getProfile(userId, tx);
    });

    logAudit({
      profileId: userId,
      action: "profile.avatar_updated",
      resourceType: "profile",
      resourceId: userId,
      metadata: { contentType: avatar.contentType, size: stored.size },
      ipAddress: getClientIp(c.req.raw),
    });

    return c.json({ data: updated });
  })
  // ── DELETE /console/profile/avatar - Remove profile avatar ─────────────────
  .delete("/profile/avatar", async (c) => {
    const userId = c.get("userId");
    const now = new Date();

    const updated = await db.transaction(async (tx) => {
      await tx
        .update(storageObjects)
        .set({ deletedAt: now })
        .where(
          and(
            eq(storageObjects.accountId, userId),
            eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
            eq(storageObjects.resourceId, userId),
            isNull(storageObjects.deletedAt),
          ),
        );
      await tx
        .update(profiles)
        .set({ avatarUrl: null })
        .where(eq(profiles.id, userId));
      await tx.update(users).set({ image: null }).where(eq(users.id, userId));
      return getProfile(userId, tx);
    });

    logAudit({
      profileId: userId,
      action: "profile.avatar_deleted",
      resourceType: "profile",
      resourceId: userId,
      ipAddress: getClientIp(c.req.raw),
    });

    return c.json({ data: updated });
  })
  // ── PUT /console/profile - Update profile ───────────────────────────────────
  .put("/profile", jsonValidator(updateConsoleProfileSchema), async (c) => {
    const userId = c.get("userId");
    const { displayName, handle, bio } = c.req.valid("json");

    if (!displayName && !handle && bio === undefined) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
        400,
      );
    }

    // Check handle uniqueness if changing
    if (handle) {
      const [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.handle, handle), isNull(profiles.deletedAt)))
        .limit(1);

      if (existing && existing.id !== userId) {
        return c.json(
          { error: { code: "CONFLICT", message: "Handle is already taken" } },
          409,
        );
      }
    }

    // Update profile
    const profileUpdates: Record<string, unknown> = {};
    if (displayName !== undefined) profileUpdates.displayName = displayName;
    if (handle !== undefined) profileUpdates.handle = handle;
    if (bio !== undefined) profileUpdates.bio = bio;

    await db
      .update(profiles)
      .set(profileUpdates)
      .where(eq(profiles.id, userId))
      .returning({ id: profiles.id });

    // Sync displayName → users.name
    if (displayName !== undefined) {
      await db
        .update(users)
        .set({ name: displayName })
        .where(eq(users.id, userId));
    }

    logAudit({
      profileId: userId,
      action: "profile.updated",
      resourceType: "profile",
      resourceId: userId,
      metadata: { fields: Object.keys(profileUpdates) },
      ipAddress: getClientIp(c.req.raw),
    });

    const updated = await getProfile(userId);
    return c.json({ data: updated });
  })
  // ── DELETE /console/profile - Delete account ────────────────────────────────
  .delete("/profile", jsonValidator(deleteConsoleProfileSchema), async (c) => {
    const userId = c.get("userId");
    const { confirmation } = c.req.valid("json");

    // Get user email to verify confirmation
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        404,
      );
    }

    if (confirmation !== user.email) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Email confirmation does not match",
          },
        },
        400,
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
  });

type DatabaseExecutor =
  | Parameters<Parameters<typeof db.transaction>[0]>[0]
  | typeof db;

async function getProfile(userId: string, database: DatabaseExecutor = db) {
  const [profile] = await database
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

  return profile ?? null;
}

class AvatarValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AvatarValidationError";
  }
}

interface NormalizedAvatarUpload {
  buffer: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  sourceContentType: string;
}

async function normalizeAvatarUpload(params: {
  buffer: Buffer;
  contentType?: string | null;
  fileName?: string | null;
  size?: number | null;
}): Promise<NormalizedAvatarUpload> {
  const sourceContentType = normalizeAvatarContentType(
    params.contentType,
    params.fileName,
  );
  const size = params.size ?? params.buffer.byteLength;

  if (size <= 0 || size > AVATAR_MAX_BYTES) {
    throw new AvatarValidationError(
      "AVATAR_TOO_LARGE",
      `Avatar image must be between 1 byte and ${AVATAR_MAX_BYTES / 1024 / 1024}MB.`,
    );
  }

  const result = await sharp(params.buffer, {
    limitInputPixels: 4096 * 4096,
  })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: "cover",
      position: "attention",
    })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new AvatarValidationError(
        "INVALID_AVATAR_IMAGE",
        "Avatar must be a valid PNG, JPEG, or WebP image.",
      );
    });

  return {
    buffer: result.data,
    contentType: "image/webp",
    width: result.info.width,
    height: result.info.height,
    sourceContentType,
  };
}

function normalizeAvatarContentType(
  contentType?: string | null,
  fileName?: string | null,
) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (
    normalized === "image/png" ||
    normalized === "image/jpeg" ||
    normalized === "image/webp"
  ) {
    return normalized;
  }

  const lowerName = fileName?.toLowerCase() ?? "";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".webp")) return "image/webp";

  throw new AvatarValidationError(
    "UNSUPPORTED_AVATAR_TYPE",
    "Avatar must be a PNG, JPEG, or WebP image.",
  );
}
