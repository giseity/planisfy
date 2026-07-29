import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { stylePublications, styles, styleVersions } from "../schema";

export const BLANK_STYLE = {
  version: 8,
  name: "",
  sources: {},
  layers: [],
};

export const STYLE_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STYLE_HANDLE_MAX_LENGTH = 64;
const STYLE_NAME_MAX_LENGTH = 128;
const STYLE_HANDLE_ATTEMPTS = 100;

export class StyleCreationError extends Error {
  constructor(
    readonly code:
      | "INVALID_HANDLE"
      | "PLAN_LIMIT"
      | "STYLE_NOT_FOUND"
      | "HANDLE_UNAVAILABLE",
    message: string,
    readonly limit?: number,
  ) {
    super(message);
    this.name = "StyleCreationError";
  }
}

export class StyleRevisionError extends Error {
  constructor(
    readonly code: "STYLE_NOT_FOUND" | "VERSION_NOT_FOUND" | "VERSION_CONFLICT",
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "StyleRevisionError";
  }
}

export interface StyleRevisionUpdate {
  name?: string;
  description?: string | null;
  styleJson?: Record<string, unknown>;
}

export async function updateStyleRevision(params: {
  ownerId: string;
  styleId: string;
  expectedVersion: number;
  actorUserId: string;
  updates: StyleRevisionUpdate;
}) {
  return mutateStyleRevision({
    ownerId: params.ownerId,
    styleId: params.styleId,
    expectedVersion: params.expectedVersion,
    actorUserId: params.actorUserId,
    resolveUpdates: () => params.updates,
  });
}

export async function restoreStyleRevision(params: {
  ownerId: string;
  styleId: string;
  expectedVersion: number;
  targetVersion: number;
  actorUserId: string;
}) {
  return mutateStyleRevision({
    ownerId: params.ownerId,
    styleId: params.styleId,
    expectedVersion: params.expectedVersion,
    actorUserId: params.actorUserId,
    resolveUpdates: async (tx) => {
      const [snapshot] = await tx
        .select({
          styleJson: styleVersions.styleJson,
          name: styleVersions.name,
        })
        .from(styleVersions)
        .where(
          and(
            eq(styleVersions.styleId, params.styleId),
            eq(styleVersions.version, params.targetVersion),
          ),
        )
        .limit(1);

      if (!snapshot) {
        throw new StyleRevisionError(
          "VERSION_NOT_FOUND",
          "Style version not found",
        );
      }

      return {
        styleJson: snapshot.styleJson as Record<string, unknown>,
        name: snapshot.name,
      };
    },
  });
}

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function mutateStyleRevision(params: {
  ownerId: string;
  styleId: string;
  expectedVersion: number;
  actorUserId: string;
  resolveUpdates:
    | ((tx: DatabaseTransaction) => StyleRevisionUpdate)
    | ((tx: DatabaseTransaction) => Promise<StyleRevisionUpdate>);
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: styles.id,
        version: styles.version,
        styleJson: styles.styleJson,
        name: styles.name,
      })
      .from(styles)
      .where(
        and(
          eq(styles.id, params.styleId),
          eq(styles.ownerId, params.ownerId),
          isNull(styles.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    if (!current) {
      throw new StyleRevisionError("STYLE_NOT_FOUND", "Style not found");
    }
    if (current.version !== params.expectedVersion) {
      throw new StyleRevisionError(
        "VERSION_CONFLICT",
        "Style was modified by another session",
        current.version,
      );
    }

    const updates = await params.resolveUpdates(tx);
    await tx
      .insert(styleVersions)
      .values({
        styleId: current.id,
        version: current.version,
        styleJson: current.styleJson,
        name: current.name,
        createdBy: params.actorUserId,
      })
      .onConflictDoNothing();

    const [updated] = await tx
      .update(styles)
      .set({
        ...updates,
        version: sql`${styles.version} + 1`,
      })
      .where(
        and(
          eq(styles.id, current.id),
          eq(styles.ownerId, params.ownerId),
          eq(styles.version, current.version),
          isNull(styles.deletedAt),
        ),
      )
      .returning({
        id: styles.id,
        version: styles.version,
        updatedAt: styles.updatedAt,
      });

    if (!updated) {
      throw new StyleRevisionError(
        "VERSION_CONFLICT",
        "Style was modified by another session",
        current.version,
      );
    }
    return updated;
  });
}

export function slugifyStyleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function normalizeCustomStyleHandle(handle: string) {
  const normalized = handle.trim().toLowerCase();
  return normalized.length <= STYLE_HANDLE_MAX_LENGTH &&
    STYLE_HANDLE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function styleHandleCandidate(base: string, attempt: number): string {
  const fallback = base || "untitled";
  const suffix = attempt === 0 ? "" : `-${attempt}`;
  return `${fallback.slice(0, STYLE_HANDLE_MAX_LENGTH - suffix.length)}${suffix}`;
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
  maxStyles: number;
}) {
  const customHandle =
    input.handle === undefined ? undefined : normalizeCustomStyleHandle(input.handle);
  if (input.handle !== undefined && !customHandle) {
    throw new StyleCreationError(
      "INVALID_HANDLE",
      "Style handles must be lowercase slugs containing letters, numbers, and single dashes.",
    );
  }

  return db.transaction(async (tx) => {
    await lockStyleCreation(tx, input.ownerId);
    await assertStyleCapacity(tx, input.ownerId, input.maxStyles);
    const styleJson = input.styleJson ?? { ...BLANK_STYLE, name: input.name };
    return insertStyleWithAllocatedHandle(tx, {
      ownerId: input.ownerId,
      baseHandle: customHandle ?? slugifyStyleName(input.name),
      name: input.name,
      description: input.description ?? null,
      styleJson,
    });
  });
}

export async function duplicateStyleRecord(params: {
  ownerId: string;
  styleId: string;
  maxStyles: number;
}) {
  return db.transaction(async (tx) => {
    await lockStyleCreation(tx, params.ownerId);
    const [original] = await tx
      .select()
      .from(styles)
      .where(
        and(
          eq(styles.id, params.styleId),
          eq(styles.ownerId, params.ownerId),
          isNull(styles.deletedAt),
        ),
      )
      .limit(1);

    if (!original) {
      throw new StyleCreationError("STYLE_NOT_FOUND", "Style not found");
    }
    await assertStyleCapacity(tx, params.ownerId, params.maxStyles);

    const name = duplicateStyleName(original.name);
    return insertStyleWithAllocatedHandle(tx, {
      ownerId: params.ownerId,
      baseHandle: `${original.handle}-copy`,
      name,
      description: original.description,
      styleJson: original.styleJson as Record<string, unknown>,
    });
  });
}

async function lockStyleCreation(tx: DatabaseTransaction, ownerId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`styleQuota:${ownerId}`}))`,
  );
}

async function assertStyleCapacity(
  tx: DatabaseTransaction,
  ownerId: string,
  maxStyles: number,
) {
  if (maxStyles === Infinity) return;
  const [row] = await tx
    .select({ count: count() })
    .from(styles)
    .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt)));
  if ((row?.count ?? 0) >= maxStyles) {
    throw new StyleCreationError(
      "PLAN_LIMIT",
      `The account has reached its ${maxStyles}-style limit.`,
      maxStyles,
    );
  }
}

async function insertStyleWithAllocatedHandle(
  tx: DatabaseTransaction,
  input: {
    ownerId: string;
    baseHandle: string;
    name: string;
    description: string | null;
    styleJson: Record<string, unknown>;
  },
) {
  const normalizedBase =
    normalizeCustomStyleHandle(input.baseHandle) ??
    (slugifyStyleName(input.baseHandle) || "untitled");
  for (let attempt = 0; attempt <= STYLE_HANDLE_ATTEMPTS; attempt++) {
    const [created] = await tx
      .insert(styles)
      .values({
        ownerId: input.ownerId,
        handle: styleHandleCandidate(normalizedBase, attempt),
        name: input.name,
        description: input.description,
        styleJson: input.styleJson,
        originalStyleJson: input.styleJson,
        version: 1,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  }
  throw new StyleCreationError(
    "HANDLE_UNAVAILABLE",
    "Unable to allocate a unique style handle",
  );
}

function truncateCharacters(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function duplicateStyleName(name: string) {
  const suffix = " (copy)";
  return `${truncateCharacters(
    name,
    STYLE_NAME_MAX_LENGTH - suffix.length,
  )}${suffix}`;
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
