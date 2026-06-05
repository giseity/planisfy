import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  profiles,
  stylePublications,
  styles,
  styleVersions,
} from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";

export const publicStylesRoute = new Hono<AuthEnv>();

// ── GET /styles/v1/:owner/:handle — Serve published style JSON ─────────────
// Supports stable aliases and explicit immutable URLs:
//   /styles/v1/{owner}/{style}
//   /styles/v1/{owner}/{style}@{version}

publicStylesRoute.get("/styles/v1/:owner/:handle", async (c) => {
  const { owner } = c.req.param();
  const { handle, version } = parseHandleVersion(c.req.param("handle"));

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.handle, owner), isNull(profiles.deletedAt)))
    .limit(1);

  if (!profile) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Owner not found" } },
      404,
    );
  }

  const [style] = await db
    .select({
      id: styles.id,
      name: styles.name,
      handle: styles.handle,
      styleJson: styles.styleJson,
      isPublic: styles.isPublic,
      ownerId: styles.ownerId,
      version: styles.version,
    })
    .from(styles)
    .where(
      and(
        eq(styles.ownerId, profile.id),
        eq(styles.handle, handle),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  if (!style) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Style not found" } },
      404,
    );
  }

  const requestOwnerId = c.get("ownerId");
  if (!style.isPublic && style.ownerId !== requestOwnerId) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Style is private" } },
      403,
    );
  }

  const snapshot = version
    ? await resolveExplicitVersion(style.id, version)
    : await resolvePublishedVersion(style.id);

  if (!snapshot) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Published style version not found",
        },
      },
      404,
    );
  }

  c.header(
    "Cache-Control",
    style.isPublic ? "public, max-age=300" : "private, no-cache",
  );
  c.header("ETag", `"style-${style.id}-v${snapshot.version}"`);

  return c.json(snapshot.styleJson);
});

publicStylesRoute.get("/styles/v1/:owner/:handle/sprite*", async (c) => {
  return c.json(
    { error: { code: "NOT_FOUND", message: "Sprite not configured" } },
    404,
  );
});

function parseHandleVersion(value: string): {
  handle: string;
  version?: number;
} {
  const [handle, rawVersion] = value.split("@");
  const parsed = rawVersion ? Number(rawVersion) : undefined;
  return {
    handle: handle ?? value,
    version: parsed && Number.isInteger(parsed) ? parsed : undefined,
  };
}

async function resolvePublishedVersion(styleId: string) {
  const [publication] = await db
    .select({ styleVersionId: stylePublications.styleVersionId })
    .from(stylePublications)
    .where(
      and(
        eq(stylePublications.styleId, styleId),
        eq(stylePublications.alias, "latest"),
      ),
    )
    .limit(1);

  if (!publication) return null;

  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(eq(styleVersions.id, publication.styleVersionId))
    .limit(1);

  return snapshot ?? null;
}

async function resolveExplicitVersion(styleId: string, version: number) {
  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(
      and(
        eq(styleVersions.styleId, styleId),
        eq(styleVersions.version, version),
      ),
    )
    .limit(1);

  return snapshot ?? null;
}
