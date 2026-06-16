import { Hono } from "hono";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  storageObjects,
  tilesetVersions,
  tilesets,
} from "@planisfy/database";
import { getStorage } from "../lib/storage";

export const storageRoute = new Hono();

storageRoute.get("/storage/*", async (c) => {
  const key = c.req.path.replace(/^\/storage\//, "");

  if (!isSafeStorageKey(key)) {
    return c.json({ error: { code: "BAD_STORAGE_KEY" } }, 400);
  }

  const [object] = await db
    .select({
      contentType: storageObjects.contentType,
    })
    .from(storageObjects)
    .innerJoin(
      tilesetVersions,
      eq(tilesetVersions.artifactStorageObjectId, storageObjects.id),
    )
    .innerJoin(tilesets, eq(tilesets.id, tilesetVersions.tilesetId))
    .where(
      and(
        eq(storageObjects.storageKey, key),
        eq(storageObjects.provider, "local"),
        eq(storageObjects.resourceType, "tileset"),
        eq(storageObjects.artifactKind, "processed"),
        isNull(storageObjects.deletedAt),
        isNull(tilesets.deletedAt),
        isNotNull(tilesetVersions.publishedAt),
      ),
    )
    .limit(1);

  if (!object) {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }

  try {
    const data = await getStorage().download(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }
});

function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("\\")) {
    return false;
  }

  return key
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}
