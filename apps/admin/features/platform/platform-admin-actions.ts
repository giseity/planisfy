"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import {
  announcements,
  auditEvents,
  db,
  featureFlags,
  platformConfig,
} from "@planisfy/database"
import { requireAdmin, requirePlatformPermission } from "@/features/auth/admin-auth"

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function optionalDate(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function rolloutPercent(formData: FormData) {
  const value = Number(stringValue(formData, "rolloutPercent"))
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function announcementStatus(formData: FormData) {
  const value = stringValue(formData, "status") || "draft"
  if (["draft", "scheduled", "published", "archived"].includes(value)) {
    return value
  }
  throw new Error("Invalid announcement status")
}

async function audit({
  action,
  metadata,
  resourceId,
  resourceType,
  userId,
}: {
  action: string
  metadata?: Record<string, unknown>
  resourceId?: string
  resourceType: string
  userId: string
}) {
  await db.insert(auditEvents).values({
    profileId: userId,
    action,
    resourceType,
    resourceId,
    metadata,
  })
}

export async function upsertPlatformConfigAction(formData: FormData) {
  const admin = await requirePlatformPermission("platform.configuration.manage")
  const id = stringValue(formData, "id")
  const key = stringValue(formData, "key")
  const value = stringValue(formData, "value")
  const valueType = stringValue(formData, "valueType") || "text"
  const category = stringValue(formData, "category") || "General"
  const description = stringValue(formData, "description") || null
  const isSecret = formData.get("isSecret") === "on"

  if (!key) throw new Error("Configuration key is required")

  if (id) {
    const [updated] = await db
      .update(platformConfig)
      .set({
        key,
        value,
        valueType,
        category,
        description,
        isSecret,
        updatedById: admin.userId,
        updatedAt: new Date(),
      })
      .where(eq(platformConfig.id, id))
      .returning()
    await audit({
      action: "platform_config.updated",
      resourceType: "platform_config",
      resourceId: updated?.id ?? id,
      userId: admin.userId,
      metadata: { key },
    })
  } else {
    const [created] = await db
      .insert(platformConfig)
      .values({
        key,
        value,
        valueType,
        category,
        description,
        isSecret,
        updatedById: admin.userId,
      })
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: {
          value,
          valueType,
          category,
          description,
          isSecret,
          updatedById: admin.userId,
          updatedAt: new Date(),
        },
      })
      .returning()
    await audit({
      action: "platform_config.upserted",
      resourceType: "platform_config",
      resourceId: created?.id,
      userId: admin.userId,
      metadata: { key },
    })
  }

  revalidatePath("/configuration")
}

export async function createFeatureFlagAction(formData: FormData) {
  const admin = await requirePlatformPermission("platform.configuration.manage")
  const key = stringValue(formData, "key")
  const label = stringValue(formData, "label")
  if (!key || !label) throw new Error("Feature flag key and label are required")

  const [created] = await db
    .insert(featureFlags)
    .values({
      key,
      label,
      description: stringValue(formData, "description") || null,
      scope: stringValue(formData, "scope") || "global",
      enabled: formData.get("enabled") === "on",
      rolloutPercent: rolloutPercent(formData),
      updatedById: admin.userId,
    })
    .returning()

  await audit({
    action: "feature_flag.created",
    resourceType: "feature_flag",
    resourceId: created?.id,
    userId: admin.userId,
    metadata: { key },
  })
  revalidatePath("/feature-flags")
}

export async function updateFeatureFlagAction(formData: FormData) {
  const admin = await requirePlatformPermission("platform.configuration.manage")
  const id = stringValue(formData, "id")
  if (!id) throw new Error("Feature flag ID is required")

  const [updated] = await db
    .update(featureFlags)
    .set({
      label: stringValue(formData, "label"),
      description: stringValue(formData, "description") || null,
      scope: stringValue(formData, "scope") || "global",
      enabled: formData.get("enabled") === "on",
      rolloutPercent: rolloutPercent(formData),
      updatedById: admin.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(featureFlags.id, id), isNull(featureFlags.archivedAt)))
    .returning()

  await audit({
    action: "feature_flag.updated",
    resourceType: "feature_flag",
    resourceId: id,
    userId: admin.userId,
    metadata: { key: updated?.key },
  })
  revalidatePath("/feature-flags")
}

export async function archiveFeatureFlagAction(formData: FormData) {
  const admin = await requirePlatformPermission("platform.configuration.manage")
  const id = stringValue(formData, "id")
  if (!id) throw new Error("Feature flag ID is required")

  await db
    .update(featureFlags)
    .set({ archivedAt: new Date(), updatedById: admin.userId })
    .where(eq(featureFlags.id, id))
  await audit({
    action: "feature_flag.archived",
    resourceType: "feature_flag",
    resourceId: id,
    userId: admin.userId,
  })
  revalidatePath("/feature-flags")
}

export async function createAnnouncementAction(formData: FormData) {
  const admin = await requireAdmin()
  const title = stringValue(formData, "title")
  const body = stringValue(formData, "body")
  if (!title || !body) throw new Error("Announcement title and body are required")

  const [created] = await db
    .insert(announcements)
    .values({
      title,
      body,
      status: announcementStatus(formData),
      audience: stringValue(formData, "audience") || "all",
      startsAt: optionalDate(stringValue(formData, "startsAt")),
      endsAt: optionalDate(stringValue(formData, "endsAt")),
      createdById: admin.userId,
      updatedById: admin.userId,
    })
    .returning()

  await audit({
    action: "announcement.created",
    resourceType: "announcement",
    resourceId: created?.id,
    userId: admin.userId,
    metadata: { title },
  })
  revalidatePath("/announcements")
}

export async function updateAnnouncementStatusAction(formData: FormData) {
  const admin = await requireAdmin()
  const id = stringValue(formData, "id")
  const status = announcementStatus(formData)
  if (!id || !status) throw new Error("Announcement ID and status are required")

  await db
    .update(announcements)
    .set({
      status,
      archivedAt: status === "archived" ? new Date() : null,
      updatedById: admin.userId,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, id))

  await audit({
    action: "announcement.status_updated",
    resourceType: "announcement",
    resourceId: id,
    userId: admin.userId,
    metadata: { status },
  })
  revalidatePath("/announcements")
}
