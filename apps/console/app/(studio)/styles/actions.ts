"use server"

import { headers } from "next/headers"
import { auth } from "@planisfy/auth/auth"
import { db, members, styles } from "@planisfy/database"
import {
  createStyleRecord,
  duplicateStyleRecord,
  softDeleteStyleRecord,
  toggleStylePublishRecord,
} from "@planisfy/database/style-service"
import { canOrg, type OrgPermission } from "@planisfy/utils"
import { eq, and, isNull, desc } from "drizzle-orm"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

async function getStyleAccess(permission: OrgPermission): Promise<string> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session?.session || !session?.user) {
    redirect("/sign-in")
  }
  const s = session.session as { activeOrganizationId?: string | null; userId: string }
  const activeOrganizationId = s.activeOrganizationId ?? null
  if (!activeOrganizationId) return session.user.id

  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.userId, session.user.id),
        eq(members.organizationId, activeOrganizationId),
      ),
    )
    .limit(1)

  if (!membership || !canOrg(membership.role, permission)) {
    throw new Error(`Forbidden: ${permission} permission required`)
  }

  return activeOrganizationId
}

export async function getStyles() {
  const ownerId = await getStyleAccess("resource.read")

  return db
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
    .orderBy(desc(styles.updatedAt))
}

export async function createStyle(formData: FormData) {
  const ownerId = await getStyleAccess("resource.write")
  const name = formData.get("name") as string
  if (!name?.trim()) throw new Error("Name is required")

  const created = await createStyleRecord({ ownerId, name })

  redirect(`/styles/${created.id}`)
}

export async function deleteStyle(styleId: string) {
  const ownerId = await getStyleAccess("resource.write")

  await softDeleteStyleRecord(ownerId, styleId)

  revalidatePath("/styles")
}

export async function duplicateStyle(styleId: string) {
  const ownerId = await getStyleAccess("resource.write")

  const created = await duplicateStyleRecord(ownerId, styleId)
  if (!created) throw new Error("Style not found")

  revalidatePath("/styles")
  return created.id
}

export async function togglePublish(styleId: string) {
  const ownerId = await getStyleAccess("resource.write")

  await toggleStylePublishRecord(ownerId, styleId)

  revalidatePath("/styles")
}
