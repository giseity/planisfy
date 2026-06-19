import { and, eq, max } from "drizzle-orm";
import {
  db,
  storageObjects,
  tilesets,
  tilesetVersions,
  uploads,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import {
  StoragePaths,
  type TilesetArtifactFormat,
} from "@planisfy/storage-paths";
import { markProcessingJobSucceeded } from "../jobs/job-lifecycle";
import type { SourceFormat } from "../sources/upload-tiling";

export async function storeProcessedArtifact(params: {
  ownerId: string;
  tilesetId: string;
  processingJobId?: string;
  data: Buffer;
  format: SourceFormat;
  artifactFormat?: TilesetArtifactFormat;
  contentType: string;
}) {
  const storage = getStorage();
  let versionNumber: number | undefined;
  const storageFormat =
    params.artifactFormat ?? tileStorageFormat(params.format);
  const storageKey = await (async () => {
    const [versionState] = await db
      .select({ latest: max(tilesetVersions.version) })
      .from(tilesetVersions)
      .where(eq(tilesetVersions.tilesetId, params.tilesetId));
    versionNumber = (versionState?.latest ?? 0) + 1;
    return StoragePaths.tilesetVersion(
      params.ownerId,
      params.tilesetId,
      versionNumber,
      storageFormat,
    );
  })();

  const stored = await storage.upload(
    storageKey,
    params.data,
    params.contentType,
  );
  const storageInfo = storage.getInfo();

  const [storageObject] = await db
    .insert(storageObjects)
    .values({
      accountId: params.ownerId,
      provider: storageInfo.provider,
      bucket: storageInfo.bucket,
      storageKey,
      fileName: `tiles.${storageFormat}`,
      contentType: stored.contentType,
      size: stored.size,
      resourceType: "tileset",
      resourceId: params.tilesetId,
      artifactKind: "processed",
      version: versionNumber
        ? `v${versionNumber}`
        : (params.processingJobId ?? "current"),
    })
    .returning({ id: storageObjects.id });

  return {
    storageObjectId: storageObject!.id,
    storageKey,
    artifactFormat: storageFormat,
    size: stored.size,
    versionNumber,
  };
}

export type StoredTilesetArtifact = Awaited<
  ReturnType<typeof storeProcessedArtifact>
>;

export async function finalizeProcessedArtifact(params: {
  ownerId: string;
  tilesetId: string;
  uploadId?: string;
  processingJobId?: string;
  artifact: StoredTilesetArtifact;
  format: SourceFormat;
  minZoom: number;
  maxZoom: number;
  bounds?: [number, number, number, number] | null;
  fallback?: string;
}) {
  await assertCurrentTilesetBuild(params.tilesetId, params.processingJobId);

  const versionNumber =
    params.artifact.versionNumber ??
    (await nextTilesetVersion(params.tilesetId));
  const tilesetVersion = await db.transaction(async (tx) => {
    const [createdVersion] = await tx
      .insert(tilesetVersions)
      .values({
        tilesetId: params.tilesetId,
        version: versionNumber,
        artifactStorageObjectId: params.artifact.storageObjectId,
        format: tileArtifactFormat(params.artifact.artifactFormat),
        buildJobId: params.processingJobId,
        schema: {
          vector_layers: [
            {
              id: "data",
              fields: {},
              minzoom: params.minZoom,
              maxzoom: params.maxZoom,
            },
          ],
          fallback: params.fallback,
        },
        bounds: params.bounds,
        minZoom: params.minZoom,
        maxZoom: params.maxZoom,
      })
      .returning();

    const [updatedTileset] = await tx
      .update(tilesets)
      .set({
        status: "READY",
        bounds: params.bounds,
        minZoom: params.minZoom,
        maxZoom: params.maxZoom,
        layerMetadata: createdVersion!.schema,
        buildJobId: null,
      })
      .where(currentTilesetBuild(params.tilesetId, params.processingJobId))
      .returning({ id: tilesets.id });

    if (!updatedTileset) {
      throw new Error("Tileset build is no longer the active processing job");
    }

    if (params.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "READY", linkedTilesetId: params.tilesetId })
        .where(eq(uploads.id, params.uploadId));
    }

    return createdVersion!;
  });

  await markProcessingJobSucceeded(params.processingJobId, {
    tilesetId: params.tilesetId,
    tilesetVersionId: tilesetVersion!.id,
    version: versionNumber,
    storageKey: params.artifact.storageKey,
    size: params.artifact.size,
    minZoom: params.minZoom,
    maxZoom: params.maxZoom,
    fallback: params.fallback,
  });
}

async function nextTilesetVersion(tilesetId: string): Promise<number> {
  const [versionState] = await db
    .select({ latest: max(tilesetVersions.version) })
    .from(tilesetVersions)
    .where(eq(tilesetVersions.tilesetId, tilesetId));

  return (versionState?.latest ?? 0) + 1;
}

async function assertCurrentTilesetBuild(
  tilesetId: string,
  processingJobId?: string,
) {
  if (!processingJobId) return;

  const [tileset] = await db
    .select({ id: tilesets.id })
    .from(tilesets)
    .where(currentTilesetBuild(tilesetId, processingJobId))
    .limit(1);

  if (!tileset) {
    throw new Error("Tileset build is no longer the active processing job");
  }
}

function currentTilesetBuild(tilesetId: string, processingJobId?: string) {
  const base = eq(tilesets.id, tilesetId);
  return processingJobId ? and(base, eq(tilesets.buildJobId, processingJobId)) : base;
}

function tileStorageFormat(format: SourceFormat): TilesetArtifactFormat {
  if (format === "mbtiles") return "mbtiles";
  if (format === "pmtiles") return "pmtiles";
  return "pmtiles";
}

function tileArtifactFormat(
  format: TilesetArtifactFormat,
): "PMTILES" | "MBTILES" | "DIRECTORY" {
  if (format === "pmtiles") return "PMTILES";
  if (format === "mbtiles") return "MBTILES";
  return "DIRECTORY";
}
