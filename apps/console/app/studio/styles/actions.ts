"use server"

import { headers } from "next/headers"
import { auth } from "@planisfy/auth/auth"
import { db, styles } from "@planisfy/database"
import {
  createStyleRecord,
  duplicateStyleRecord,
  softDeleteStyleRecord,
  toggleStylePublishRecord,
} from "@planisfy/database/style-service"
import { eq, and, isNull, desc } from "drizzle-orm"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

async function getOwnerId(): Promise<string> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session?.session || !session?.user) {
    redirect("/sign-in")
  }
  const s = session.session as { activeOrganizationId?: string | null; userId: string }
  return s.activeOrganizationId ?? session.user.id
}

export async function getStyles() {
  const ownerId = await getOwnerId()

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
  const ownerId = await getOwnerId()
  const name = formData.get("name") as string
  if (!name?.trim()) throw new Error("Name is required")

  const created = await createStyleRecord({ ownerId, name })

  redirect(`/studio/styles/${created.id}`)
}

export async function deleteStyle(styleId: string) {
  const ownerId = await getOwnerId()

  await softDeleteStyleRecord(ownerId, styleId)

  revalidatePath("/studio/styles")
}

export async function duplicateStyle(styleId: string) {
  const ownerId = await getOwnerId()

  const created = await duplicateStyleRecord(ownerId, styleId)
  if (!created) throw new Error("Style not found")

  revalidatePath("/studio/styles")
  return created.id
}

export async function togglePublish(styleId: string) {
  const ownerId = await getOwnerId()

  await toggleStylePublishRecord(ownerId, styleId)

  revalidatePath("/studio/styles")
}
