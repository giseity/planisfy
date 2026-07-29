import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { eq, and, desc, isNull } from 'drizzle-orm'
import {
  db,
  eventOutbox,
  profiles,
  storageObjects,
  userPreferences,
  users,
} from '@planisfy/database'
import { deactivateAccount } from '@planisfy/database/accounts/lifecycle'
import {
  deleteConsoleProfileSchema,
  updateConsolePreferencesSchema,
  updateConsoleProfileSchema,
} from '@planisfy/api-contracts'
import { getStorage } from '@planisfy/storage'
import { StoragePaths } from '@planisfy/storage-paths'
import { parseEventPayload } from '@planisfy/events'
import sharp from 'sharp'
import { logAudit } from '../../shared/audit'
import { jsonValidator } from '../../shared/validation/validation'
import type { AuthEnv } from '../../middleware/auth'
import { consumeMultipartRequest, MultipartRequestError } from '../../shared/http/multipart'
import { consumeAvatarRateLimit } from '../../middleware/rate-limit'

const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_SIZE = 256
const AVATAR_RESOURCE_TYPE = 'profile_avatar'
const AVATAR_URL_BASE = '/console/profile/avatar'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    undefined
  )
}

const profileBaseRoute = new Hono<AuthEnv>()

// ── GET /console/profile - Get current user profile ─────────────────────────

export const profileRoute = profileBaseRoute
  .get('/profile', async (c) => {
    const userId = c.get('userId')

    const profile = await getProfile(userId)
    if (!profile) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Profile not found' } }, 404)
    }

    return c.json({ data: profile })
  })
  .patch(
    '/profile/preferences',
    jsonValidator(updateConsolePreferencesSchema),
    async (c) => {
      const userId = c.get('userId')
      const preferences = c.req.valid('json')
      const now = new Date()

      await db
        .insert(userPreferences)
        .values({
          userId,
          ...preferences,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            ...preferences,
            updatedAt: now,
          },
        })

      await logAudit({
        accountId: userId,
        actorUserId: userId,
        action: 'profile.preferences_updated',
        resourceType: 'profile',
        resourceId: userId,
        metadata: { fields: Object.keys(preferences) },
        ipAddress: getClientIp(c.req.raw),
      })

      return c.json({ data: await getProfile(userId) })
    }
  )
  // ── GET /console/profile/avatar - Serve current profile avatar ──────────────
  .get('/profile/avatar', async (c) => {
    const userId = c.get('userId')
    const objectId = c.req.query('object')

    if (objectId && !UUID_RE.test(objectId)) {
      return c.json(
        {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid avatar object' },
        },
        400
      )
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
          objectId ? eq(storageObjects.id, objectId) : eq(storageObjects.accountId, userId),
          eq(storageObjects.accountId, userId),
          eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
          eq(storageObjects.resourceId, userId),
          isNull(storageObjects.deletedAt)
        )
      )
      .orderBy(desc(storageObjects.createdAt))
      .limit(1)

    if (!object) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Avatar not found' } }, 404)
    }

    const data = await getStorage().download(object.storageKey)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': object.contentType ?? 'image/webp',
        'Cache-Control': 'private, max-age=300',
      },
    })
  })
  // ── POST /console/profile/avatar - Upload profile avatar ───────────────────
  .post('/profile/avatar', async (c) => {
    const userId = c.get('userId')
    const retryAfter = await consumeAvatarRateLimit(userId, getClientIp(c.req.raw) ?? 'unknown')
    if (retryAfter) {
      c.header('Retry-After', String(retryAfter))
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: `Avatar upload limit exceeded. Retry after ${retryAfter} seconds.`,
          },
        },
        429
      )
    }
    let uploadedFile:
      | { data: Buffer; contentType: string | null; fileName: string; size: number }
      | undefined
    try {
      await consumeMultipartRequest({
        request: c.req.raw,
        maxTotalBytes: AVATAR_MAX_BYTES + 64 * 1024,
        maxFileBytes: AVATAR_MAX_BYTES,
        maxFiles: 1,
        maxFields: 0,
        onFile: async (file) => {
          if (file.fieldName !== 'file' || uploadedFile) {
            throw new MultipartRequestError(
              'INVALID_MULTIPART',
              "Avatar multipart body must contain one 'file' part"
            )
          }
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of file.stream) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            size += buffer.byteLength
            chunks.push(buffer)
          }
          uploadedFile = {
            data: Buffer.concat(chunks, size),
            contentType: file.contentType || null,
            fileName: file.fileName,
            size,
          }
        },
      })
    } catch (error) {
      if (error instanceof MultipartRequestError) {
        const tooLarge = error.code === 'MULTIPART_LIMIT'
        return c.json(
          {
            error: {
              code: tooLarge ? 'AVATAR_TOO_LARGE' : 'INVALID_MULTIPART',
              message: error.message,
            },
          },
          tooLarge ? 413 : 400
        )
      }
      throw error
    }

    if (!uploadedFile) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'PNG, JPEG, or WebP image is required',
          },
        },
        400
      )
    }

    if (uploadedFile.size <= 0 || uploadedFile.size > AVATAR_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: 'AVATAR_TOO_LARGE',
            message: `Avatar image must be between 1 byte and ${AVATAR_MAX_BYTES / 1024 / 1024}MB.`,
          },
        },
        400
      )
    }

    let avatar: NormalizedAvatarUpload
    try {
      avatar = await normalizeAvatarUpload({
        buffer: uploadedFile.data,
        contentType: uploadedFile.contentType,
        fileName: uploadedFile.fileName,
        size: uploadedFile.size,
      })
    } catch (err) {
      if (err instanceof AvatarValidationError) {
        return c.json({ error: { code: err.code, message: err.message } }, 400)
      }
      throw err
    }

    const avatarId = randomUUID()
    const fileName = 'avatar.webp'
    const storage = getStorage()
    const storageInfo = storage.getInfo()
    const storageKey = StoragePaths.profileAvatar(userId, avatarId, fileName)
    const stored = await storage.upload(storageKey, avatar.buffer, avatar.contentType)

    const now = new Date()
    let updated: Awaited<ReturnType<typeof getProfile>>
    try {
      updated = await db.transaction(async (tx) => {
        const replacedObjects = await tx
          .select({ id: storageObjects.id })
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.accountId, userId),
              eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
              eq(storageObjects.resourceId, userId),
              isNull(storageObjects.deletedAt)
            )
          )
        await tx
          .update(storageObjects)
          .set({ deletedAt: now })
          .where(
            and(
              eq(storageObjects.accountId, userId),
              eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
              eq(storageObjects.resourceId, userId),
              isNull(storageObjects.deletedAt)
            )
          )

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
            artifactKind: 'avatar',
            metadata: {
              width: avatar.width,
              height: avatar.height,
              sourceContentType: avatar.sourceContentType,
            },
          })
          .returning()

        const avatarUrl = `${AVATAR_URL_BASE}?object=${object!.id}`
        await tx.update(profiles).set({ avatarUrl }).where(eq(profiles.id, userId))
        await tx.update(users).set({ image: avatarUrl }).where(eq(users.id, userId))
        if (replacedObjects.length > 0) {
          await tx.insert(eventOutbox).values(
            replacedObjects.map((replaced) => ({
              eventName: 'artifact.cleanup.requested',
              payload: parseEventPayload('artifact.cleanup.requested', {
                storageObjectId: replaced.id,
                reason: 'profile avatar replaced',
              }),
            }))
          )
        }

        return getProfile(userId, tx)
      })
    } catch (error) {
      await storage.delete(storageKey).catch(() => undefined)
      throw error
    }

    await logAudit({
      accountId: userId,
      actorUserId: userId,
      action: 'profile.avatar_updated',
      resourceType: 'profile',
      resourceId: userId,
      metadata: { contentType: avatar.contentType, size: stored.size },
      ipAddress: getClientIp(c.req.raw),
    })

    return c.json({ data: updated })
  })
  // ── DELETE /console/profile/avatar - Remove profile avatar ─────────────────
  .delete('/profile/avatar', async (c) => {
    const userId = c.get('userId')
    const now = new Date()

    const updated = await db.transaction(async (tx) => {
      const deletedObjects = await tx
        .select({ id: storageObjects.id })
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.accountId, userId),
            eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
            eq(storageObjects.resourceId, userId),
            isNull(storageObjects.deletedAt)
          )
        )
      await tx
        .update(storageObjects)
        .set({ deletedAt: now })
        .where(
          and(
            eq(storageObjects.accountId, userId),
            eq(storageObjects.resourceType, AVATAR_RESOURCE_TYPE),
            eq(storageObjects.resourceId, userId),
            isNull(storageObjects.deletedAt)
          )
        )
      await tx.update(profiles).set({ avatarUrl: null }).where(eq(profiles.id, userId))
      await tx.update(users).set({ image: null }).where(eq(users.id, userId))
      if (deletedObjects.length > 0) {
        await tx.insert(eventOutbox).values(
          deletedObjects.map((deleted) => ({
            eventName: 'artifact.cleanup.requested',
            payload: parseEventPayload('artifact.cleanup.requested', {
              storageObjectId: deleted.id,
              reason: 'profile avatar deleted',
            }),
          }))
        )
      }
      return getProfile(userId, tx)
    })

    await logAudit({
      accountId: userId,
      actorUserId: userId,
      action: 'profile.avatar_deleted',
      resourceType: 'profile',
      resourceId: userId,
      ipAddress: getClientIp(c.req.raw),
    })

    return c.json({ data: updated })
  })
  // ── PUT /console/profile - Update profile ───────────────────────────────────
  .put('/profile', jsonValidator(updateConsoleProfileSchema), async (c) => {
    const userId = c.get('userId')
    const { displayName, handle, bio } = c.req.valid('json')

    if (!displayName && !handle && bio === undefined) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } }, 400)
    }

    // Check handle uniqueness if changing
    if (handle) {
      const [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.handle, handle), isNull(profiles.deletedAt)))
        .limit(1)

      if (existing && existing.id !== userId) {
        return c.json({ error: { code: 'CONFLICT', message: 'Handle is already taken' } }, 409)
      }
    }

    // Update profile
    const profileUpdates: Record<string, unknown> = {}
    if (displayName !== undefined) profileUpdates.displayName = displayName
    if (handle !== undefined) profileUpdates.handle = handle
    if (bio !== undefined) profileUpdates.bio = bio

    await db
      .update(profiles)
      .set(profileUpdates)
      .where(eq(profiles.id, userId))
      .returning({ id: profiles.id })

    // Sync displayName → users.name
    if (displayName !== undefined) {
      await db.update(users).set({ name: displayName }).where(eq(users.id, userId))
    }

    await logAudit({
      accountId: userId,
      actorUserId: userId,
      action: 'profile.updated',
      resourceType: 'profile',
      resourceId: userId,
      metadata: { fields: Object.keys(profileUpdates) },
      ipAddress: getClientIp(c.req.raw),
    })

    const updated = await getProfile(userId)
    return c.json({ data: updated })
  })
  // ── DELETE /console/profile - Delete account ────────────────────────────────
  .delete('/profile', jsonValidator(deleteConsoleProfileSchema), async (c) => {
    const userId = c.get('userId')
    const { confirmation } = c.req.valid('json')

    // Get user email to verify confirmation
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
    }

    if (confirmation !== user.email) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Email confirmation does not match',
          },
        },
        400
      )
    }

    const result = await deactivateAccount({
      accountId: userId,
      accountType: 'USER',
      actorId: userId,
      reason: 'User requested terminal deactivation',
    })

    return c.json({
      data: {
        deactivated: true,
        deactivatedAt: result.deactivatedAt.toISOString(),
      },
    })
  })

type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db

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
      emailNotificationsEnabled: userPreferences.emailNotificationsEnabled,
      defaultView: userPreferences.defaultView,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.id, users.id))
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(eq(profiles.id, userId))
    .limit(1)

  if (!profile) return null

  const { emailNotificationsEnabled, defaultView, ...profileData } = profile
  return {
    ...profileData,
    preferences: {
      emailNotificationsEnabled: emailNotificationsEnabled ?? true,
      defaultView: defaultView ?? 'dashboard',
    },
  }
}

class AvatarValidationError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AvatarValidationError'
  }
}

interface NormalizedAvatarUpload {
  buffer: Buffer
  contentType: 'image/webp'
  width: number
  height: number
  sourceContentType: string
}

async function normalizeAvatarUpload(params: {
  buffer: Buffer
  contentType?: string | null
  fileName?: string | null
  size?: number | null
}): Promise<NormalizedAvatarUpload> {
  const sourceContentType = normalizeAvatarContentType(params.contentType, params.fileName)
  const size = params.size ?? params.buffer.byteLength

  if (size <= 0 || size > AVATAR_MAX_BYTES) {
    throw new AvatarValidationError(
      'AVATAR_TOO_LARGE',
      `Avatar image must be between 1 byte and ${AVATAR_MAX_BYTES / 1024 / 1024}MB.`
    )
  }

  const result = await sharp(params.buffer, {
    limitInputPixels: 4096 * 4096,
  })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: 'cover',
      position: 'attention',
    })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new AvatarValidationError(
        'INVALID_AVATAR_IMAGE',
        'Avatar must be a valid PNG, JPEG, or WebP image.'
      )
    })

  return {
    buffer: result.data,
    contentType: 'image/webp',
    width: result.info.width,
    height: result.info.height,
    sourceContentType,
  }
}

function normalizeAvatarContentType(contentType?: string | null, fileName?: string | null) {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase()
  if (normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp') {
    return normalized
  }

  const lowerName = fileName?.toLowerCase() ?? ''
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lowerName.endsWith('.webp')) return 'image/webp'

  throw new AvatarValidationError(
    'UNSUPPORTED_AVATAR_TYPE',
    'Avatar must be a PNG, JPEG, or WebP image.'
  )
}
