import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import {
  db,
  eventOutbox,
  processingJobLogs,
  processingJobs,
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
import { ProcessingJobCanceledError } from "../jobs/job-lifecycle";
import {
  UPLOAD_VECTOR_LAYER_ID,
  type SourceFormat,
} from "../sources/upload-tiling";

export async function storeProcessedArtifact(params: {
  ownerId: string;
  tilesetId: string;
  processingJobId?: string;
  data: Buffer;
  format: SourceFormat;
  artifactFormat?: TilesetArtifactFormat;
  contentType: string;
}) {
  if (!params.processingJobId) {
    throw new Error("Processed artifacts require a processing job id");
  }
  const processingJobId = params.processingJobId;
  const storage = getStorage();
  const storageFormat =
    params.artifactFormat ?? tileStorageFormat(params.format);
  const storageKey = StoragePaths.tilesetBuildArtifact(
    params.ownerId,
    params.tilesetId,
    processingJobId,
    storageFormat,
  );
  const stored = await storage.upload(
    storageKey,
    params.data,
    params.contentType,
  );
  const storageInfo = storage.getInfo();

  try {
    const storageObject = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`artifact:${processingJobId}`}))`,
      );
      const [existing] = await tx
        .select()
        .from(storageObjects)
        .where(eq(storageObjects.processingJobId, processingJobId))
        .for("update")
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(storageObjects)
          .set({
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
            version: `build:${processingJobId}`,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(storageObjects.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await tx
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
          processingJobId,
          version: `build:${processingJobId}`,
        })
        .returning();
      return created!;
    });

    return {
      storageObjectId: storageObject.id,
      storageKey,
      artifactFormat: storageFormat,
      size: stored.size,
    };
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
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
  if (!params.processingJobId) {
    await requestArtifactCleanup(
      params.artifact.storageObjectId,
      "missing_processing_job",
    );
    throw new Error("Processed artifact finalization requires a processing job id");
  }
  const jobId = params.processingJobId;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`tilesetBuild:${params.tilesetId}`}))`,
      );
      const [job] = await tx
        .select()
        .from(processingJobs)
        .where(
          and(
            eq(processingJobs.id, jobId),
            eq(processingJobs.accountId, params.ownerId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !job ||
        !["PENDING", "PROCESSING"].includes(job.status) ||
        job.cancelRequestedAt
      ) {
        throw new ProcessingJobCanceledError(job?.cancelRequestedAt);
      }

      const [tileset] = await tx
        .select()
        .from(tilesets)
        .where(
          and(
            eq(tilesets.id, params.tilesetId),
            eq(tilesets.accountId, params.ownerId),
            isNull(tilesets.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!tileset || tileset.buildJobId !== jobId) {
        throw new ProcessingJobCanceledError();
      }

      const [artifact] = await tx
        .select()
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.id, params.artifact.storageObjectId),
            eq(storageObjects.accountId, params.ownerId),
            eq(storageObjects.processingJobId, jobId),
            isNull(storageObjects.deletedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!artifact) {
        throw new Error("Processed artifact ledger entry is unavailable");
      }

      const [versionState] = await tx
        .select({ latest: max(tilesetVersions.version) })
        .from(tilesetVersions)
        .where(eq(tilesetVersions.tilesetId, params.tilesetId));
      const versionNumber = (versionState?.latest ?? 0) + 1;
      const schema = {
        vector_layers: [
          {
            id: UPLOAD_VECTOR_LAYER_ID,
            fields: {},
            minzoom: params.minZoom,
            maxzoom: params.maxZoom,
          },
        ],
        fallback: params.fallback,
      };
      const [createdVersion] = await tx
        .insert(tilesetVersions)
        .values({
          tilesetId: params.tilesetId,
          version: versionNumber,
          artifactStorageObjectId: artifact.id,
          format: tileArtifactFormat(params.artifact.artifactFormat),
          buildJobId: jobId,
          schema,
          bounds: params.bounds,
          minZoom: params.minZoom,
          maxZoom: params.maxZoom,
        })
        .returning();
      if (!createdVersion) throw new Error("Failed to create tileset version");

      const [updatedTileset] = await tx
        .update(tilesets)
        .set({
          status: "READY",
          bounds: params.bounds,
          minZoom: params.minZoom,
          maxZoom: params.maxZoom,
          layerMetadata: schema,
          buildJobId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tilesets.id, params.tilesetId),
            eq(tilesets.buildJobId, jobId),
          ),
        )
        .returning({ id: tilesets.id });
      if (!updatedTileset) {
        throw new ProcessingJobCanceledError();
      }

      if (params.uploadId) {
        await tx
          .update(uploads)
          .set({
            status: "READY",
            linkedTilesetId: params.tilesetId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(uploads.id, params.uploadId),
              eq(uploads.accountId, params.ownerId),
            ),
          );
      }

      const output = {
        tilesetId: params.tilesetId,
        tilesetVersionId: createdVersion.id,
        version: versionNumber,
        storageKey: params.artifact.storageKey,
        size: params.artifact.size,
        minZoom: params.minZoom,
        maxZoom: params.maxZoom,
        fallback: params.fallback,
      };
      const [completedJob] = await tx
        .update(processingJobs)
        .set({
          status: "SUCCEEDED",
          progress: 100,
          output,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(processingJobs.id, jobId),
            inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
            isNull(processingJobs.cancelRequestedAt),
          ),
        )
        .returning({ id: processingJobs.id });
      if (!completedJob) {
        throw new ProcessingJobCanceledError();
      }
      await tx.insert(processingJobLogs).values({
        jobId,
        level: "info",
        message: "Geodata artifact finalized",
        metadata: output,
      });

      return createdVersion;
    });
  } catch (error) {
    await requestArtifactCleanup(
      params.artifact.storageObjectId,
      error instanceof ProcessingJobCanceledError
        ? "build_canceled_or_superseded"
        : "finalization_failed",
    );
    throw error;
  }
}

async function requestArtifactCleanup(storageObjectId: string, reason: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(storageObjects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(storageObjects.id, storageObjectId));
    await tx.insert(eventOutbox).values({
      eventName: "artifact.cleanup.requested",
      payload: { storageObjectId, reason },
    });
  });
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
