"use server"

import { headers } from "next/headers"
import { auth } from "@planisfy/auth/auth"
import { db, styles } from "@planisfy/database"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

async function uniqueHandle(ownerId: string, base: string): Promise<string> {
  let handle = base || "untitled"
  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? handle : `${handle}-${attempt}`
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
      .limit(1)
    if (!existing) return candidate
    attempt++
    if (attempt > 100) return `${handle}-${Date.now()}`
  }
}

const BLANK_STYLE = {
  version: 8,
  name: "",
  sources: {},
  layers: [],
}

export async function createStyle(formData: FormData) {
  const ownerId = await getOwnerId()
  const name = formData.get("name") as string
  if (!name?.trim()) throw new Error("Name is required")

  const handle = await uniqueHandle(ownerId, slugify(name))
  const styleJson = { ...BLANK_STYLE, name }

  const [created] = await db
    .insert(styles)
    .values({
      ownerId,
      handle,
      name,
      styleJson,
      originalStyleJson: styleJson,
      version: 1,
    })
    .returning({ id: styles.id })

  redirect(`/studio/styles/${created!.id}`)
}

export async function deleteStyle(styleId: string) {
  const ownerId = await getOwnerId()

  await db
    .update(styles)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )

  revalidatePath("/studio/styles")
}

export async function duplicateStyle(styleId: string) {
  const ownerId = await getOwnerId()

  const [original] = await db
    .select()
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .limit(1)

  if (!original) throw new Error("Style not found")

  const handle = await uniqueHandle(ownerId, `${original.handle}-copy`)

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
    .returning({ id: styles.id })

  revalidatePath("/studio/styles")
  return created!.id
}

export async function togglePublish(styleId: string) {
  const ownerId = await getOwnerId()

  await db
    .update(styles)
    .set({ isPublic: sql`NOT ${styles.isPublic}` })
    .where(
      and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt))
    )

  revalidatePath("/studio/styles")
}
