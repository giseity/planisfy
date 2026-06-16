import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  accounts,
  stylePublications,
  styles,
  styleVersions,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import {
  canReadPublishedStyle,
  parseStyleHandleVersion,
  publishedStyleJson,
  styleCacheControl,
  styleEtag,
} from "../lib/public-style-contract";
import {
  parsePublishedSpriteMetadata,
  type SpriteVariant,
} from "../lib/style-sprites";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const publicStylesRoute = new Hono<AuthEnv>();

// ── GET /styles/v1/:owner/:handle — Serve published style JSON ─────────────
// Supports stable aliases and explicit immutable URLs:
//   /styles/v1/{owner}/{style}
//   /styles/v1/{owner}/{style}@{version}

publicStylesRoute.get("/styles/v1/:owner/:handle", async (c) => {
  const { owner } = c.req.param();
  const { handle, version, invalidVersion } = parseStyleHandleVersion(
    c.req.param("handle"),
  );

  if (invalidVersion) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid style version",
        },
      },
      400,
    );
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.handle, owner), isNull(accounts.deletedAt)))
    .limit(1);

  if (!account) {
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
        eq(styles.ownerId, account.id),
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
  if (
    !canReadPublishedStyle({
      isPublic: style.isPublic,
      styleOwnerId: style.ownerId,
      requestOwnerId,
    })
  ) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Style is private" } },
      403,
    );
  }

  const resolved = version
    ? await resolveExplicitVersion(style.id, version)
    : await resolvePublishedVersion(style.id);

  if (!resolved) {
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

  c.header("Cache-Control", styleCacheControl(style.isPublic));
  c.header("ETag", styleEtag(style.id, resolved.snapshot.version));

  const sprite = parsePublishedSpriteMetadata(resolved.publication.metadata);

  return c.json(
    publishedStyleJson({
      draftStyleJson: style.styleJson,
      snapshotStyleJson: resolved.snapshot.styleJson,
      spriteBaseUrl: sprite
        ? spriteBaseUrl(c, owner, c.req.param("handle"))
        : null,
    }),
  );
});

publicStylesRoute.get("/styles/v1/:owner/:handle/sprite*", async (c) => {
  const suffix = c.req.path.match(/\/sprite(@2x)?\.(json|png)$/);
  if (!suffix) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Sprite not configured" } },
      404,
    );
  }

  const { owner } = c.req.param();
  const { handle, version, invalidVersion } = parseStyleHandleVersion(
    c.req.param("handle"),
  );
  if (invalidVersion) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid style version" } },
      400,
    );
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.handle, owner), isNull(accounts.deletedAt)))
    .limit(1);
  if (!account) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Owner not found" } },
      404,
    );
  }

  const [style] = await db
    .select({
      id: styles.id,
      handle: styles.handle,
      isPublic: styles.isPublic,
      ownerId: styles.ownerId,
    })
    .from(styles)
    .where(
      and(
        eq(styles.ownerId, account.id),
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
  if (
    !canReadPublishedStyle({
      isPublic: style.isPublic,
      styleOwnerId: style.ownerId,
      requestOwnerId,
    })
  ) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Style is private" } },
      403,
    );
  }

  const resolved = version
    ? await resolveExplicitVersion(style.id, version)
    : await resolvePublishedVersion(style.id);
  const sprite = parsePublishedSpriteMetadata(resolved?.publication.metadata);
  if (!resolved || !sprite) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Sprite not configured" } },
      404,
    );
  }

  const scale = suffix[1] === "@2x";
  const kind = suffix[2] as "json" | "png";
  const variant: SpriteVariant =
    kind === "json" ? (scale ? "json2x" : "json") : scale ? "png2x" : "png";
  const data = await getStorage().download(sprite.storageKeys[variant]);

  c.header("Cache-Control", styleCacheControl(style.isPublic));
  c.header("ETag", `"sprite-${sprite.id}-${variant}"`);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": kind === "json" ? "application/json" : "image/png",
      "Cache-Control": styleCacheControl(style.isPublic),
      ETag: `"sprite-${sprite.id}-${variant}"`,
    },
  });
});

async function resolvePublishedVersion(styleId: string) {
  const [publication] = await db
    .select({
      styleVersionId: stylePublications.styleVersionId,
      metadata: stylePublications.metadata,
    })
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

  return snapshot ? { snapshot, publication } : null;
}

async function resolveExplicitVersion(styleId: string, version: number) {
  const [publication] = await db
    .select({
      styleVersionId: stylePublications.styleVersionId,
      metadata: stylePublications.metadata,
    })
    .from(stylePublications)
    .where(
      and(
        eq(stylePublications.styleId, styleId),
        eq(stylePublications.alias, `v${version}`),
      ),
    )
    .limit(1);

  if (!publication) return null;

  const [snapshot] = await db
    .select()
    .from(styleVersions)
    .where(eq(styleVersions.id, publication.styleVersionId))
    .limit(1);

  return snapshot?.version === version ? { snapshot, publication } : null;
}

function spriteBaseUrl(
  _c: { req: { url: string } },
  owner: string,
  handle: string,
) {
  return spriteBaseUrlFromApiBase(env.NEXT_PUBLIC_API_URL, owner, handle);
}

export function spriteBaseUrlFromApiBase(
  apiBase: string,
  owner: string,
  handle: string,
) {
  return `${apiBase.replace(/\/$/, "")}/styles/v1/${encodeURIComponent(owner)}/${encodeURIComponent(handle)}/sprite`;
}
