import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { stylePublications, styles, styleVersions } from "./schema";

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

function styleHandleCandidate(base: string, attempt: number): string {
  const fallback = base || "untitled";
  const suffix = attempt === 0 ? "" : `-${attempt}`;
  return `${fallback.slice(0, 64 - suffix.length)}${suffix}`;
}

function isUniqueViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "23505"
  );
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
  const baseHandle = input.handle ?? slugifyStyleName(input.name);

  for (let attempt = 0; attempt <= 100; attempt++) {
    try {
      const [created] = await db
        .insert(styles)
        .values({
          ownerId: input.ownerId,
          handle: styleHandleCandidate(baseHandle, attempt),
          name: input.name,
          description: input.description ?? null,
          styleJson,
          originalStyleJson: styleJson,
          version: 1,
        })
        .returning();

      return created!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  throw new Error("Unable to allocate a unique style handle");
}

export async function duplicateStyleRecord(ownerId: string, styleId: string) {
  const [original] = await db
    .select()
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.ownerId, ownerId), isNull(styles.deletedAt)))
    .limit(1);

  if (!original) return null;

  const baseHandle = `${original.handle}-copy`;

  for (let attempt = 0; attempt <= 100; attempt++) {
    try {
      const [created] = await db
        .insert(styles)
        .values({
          ownerId,
          handle: styleHandleCandidate(baseHandle, attempt),
          name: `${original.name} (copy)`,
          description: original.description,
          styleJson: original.styleJson,
          originalStyleJson: original.styleJson,
          version: 1,
        })
        .returning();

      return created!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  throw new Error("Unable to allocate a unique style handle");
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
  const updated = await db.transaction(async (tx) => {
    const [style] = await tx
      .select()
      .from(styles)
      .where(
        and(
          eq(styles.id, styleId),
          eq(styles.ownerId, ownerId),
          isNull(styles.deletedAt),
        ),
      )
      .limit(1);

    if (!style) return null;

    if (style.isPublic) {
      const [unpublished] = await tx
        .update(styles)
        .set({ isPublic: false })
        .where(eq(styles.id, styleId))
        .returning({ id: styles.id, isPublic: styles.isPublic });
      return unpublished ?? null;
    }

    await tx
      .insert(styleVersions)
      .values({
        styleId,
        version: style.version,
        styleJson: style.styleJson,
        name: style.name,
      })
      .onConflictDoNothing();

    const [snapshot] = await tx
      .select()
      .from(styleVersions)
      .where(
        and(
          eq(styleVersions.styleId, styleId),
          eq(styleVersions.version, style.version),
        ),
      )
      .limit(1);

    if (!snapshot) throw new Error("Failed to create style version");

    const metadata = { version: snapshot.version };
    await tx
      .insert(stylePublications)
      .values({
        styleId,
        styleVersionId: snapshot.id,
        accountId: ownerId,
        alias: "latest",
        metadata,
      })
      .onConflictDoUpdate({
        target: [stylePublications.styleId, stylePublications.alias],
        set: {
          styleVersionId: snapshot.id,
          accountId: ownerId,
          metadata,
        },
      });

    await tx
      .insert(stylePublications)
      .values({
        styleId,
        styleVersionId: snapshot.id,
        accountId: ownerId,
        alias: `v${snapshot.version}`,
        metadata,
      })
      .onConflictDoNothing();

    const [published] = await tx
      .update(styles)
      .set({ isPublic: true })
      .where(eq(styles.id, styleId))
      .returning({ id: styles.id, isPublic: styles.isPublic });

    return published ?? null;
  });

  return updated ?? null;
}
