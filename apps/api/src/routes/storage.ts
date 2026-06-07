import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, storageObjects } from "@planisfy/database";
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
      resourceType: storageObjects.resourceType,
      artifactKind: storageObjects.artifactKind,
    })
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.storageKey, key),
        eq(storageObjects.provider, "local"),
        isNull(storageObjects.deletedAt)
      )
    )
    .limit(1);

  if (!object || !isPublicStorageObject(object)) {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }

  try {
    const data = await getStorage().download(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": object?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }
});

function isPublicStorageObject(object: {
  resourceType: string | null;
  artifactKind: string | null;
}) {
  return object.resourceType === "tileset" && object.artifactKind === "processed";
}

function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("\\")) {
    return false;
  }

  return key.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}
