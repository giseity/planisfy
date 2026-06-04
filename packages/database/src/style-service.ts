import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { styles } from "./schema";

export const BLANK_STYLE = {
  version: 8,
  name: "",
  sources: {},
  layers: [],
};

export function slugifyStyleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function uniqueStyleHandle(
  ownerId: string,
  base: string
): Promise<string> {
  const handle = base || "untitled";
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

export async function createStyleRecord(input: {
  ownerId: string;
  name: string;
  handle?: string;
  description?: string | null;
  styleJson?: Record<string, unknown>;
}) {
  const styleJson = input.styleJson ?? { ...BLANK_STYLE, name: input.name };
  const handle = await uniqueStyleHandle(
    input.ownerId,
    input.handle ?? slugifyStyleName(input.name)
  );

  const [created] = await db
    .insert(styles)
    .values({
      ownerId: input.ownerId,
      handle,
      name: input.name,
      description: input.description ?? null,
      styleJson,
      originalStyleJson: styleJson,
      version: 1,
    })
    .returning();

  return created!;
}

export async function duplicateStyleRecord(ownerId: string, styleId: string) {
  const [original] = await db
    .select()
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .limit(1);

  if (!original) return null;

  const handle = await uniqueStyleHandle(ownerId, `${original.handle}-copy`);

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

  return created!;
}

export async function softDeleteStyleRecord(ownerId: string, styleId: string) {
  const [deleted] = await db
    .update(styles)
    .set({ deletedAt: new Date() })
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .returning({ id: styles.id, name: styles.name });

  return deleted ?? null;
}

export async function toggleStylePublishRecord(ownerId: string, styleId: string) {
  const [updated] = await db
    .update(styles)
    .set({ isPublic: sql`NOT ${styles.isPublic}` })
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .returning({ id: styles.id, isPublic: styles.isPublic });

  return updated ?? null;
}
